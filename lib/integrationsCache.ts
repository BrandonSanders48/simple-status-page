import { eq } from "drizzle-orm";
import { db } from "./db/client";
import { integrationTargets, integrationHealthStatus, settings } from "./db/schema";
import { getIntegrationCatalogEntry } from "./integrationRegistry";
import { getIntegrationCatalogMeta } from "./integrationCatalogMeta";
import { getIgnoredKeys } from "./integrationIgnore";
import { notifyIntegrationTransitions } from "./notifier";
import { parseIntegrationConfig, isGotoSmsAvailable } from "./integrationTargets";
import type { IntegrationStatus } from "./integrations/types";

/** Same shape as an integration's own item, plus whether an admin has ignored it -
 * computed here (not by each integration's fetchStatus, which has no notion of
 * ignore state), so it's a distinct payload type from IntegrationStatus.items. */
export interface IntegrationItemPayload {
  label: string;
  value: string;
  ok: boolean | null;
  key: string;
  ignored: boolean;
}

export interface IntegrationStatusPayload extends Omit<IntegrationStatus, "items"> {
  items: IntegrationItemPayload[];
}

export interface IntegrationTargetPayload {
  id: number;
  integration: string;
  name: string;
  status: IntegrationStatusPayload;
}

export interface IntegrationsPayload {
  enabled: boolean;
  targets: IntegrationTargetPayload[];
  /** Whether phone/SMS subscriptions are actually deliverable right now (see
   * lib/integrationTargets.ts's isGotoSmsAvailable) - lets the public Subscribe form
   * only offer a phone number as an option when something could actually text it. */
  smsAvailable: boolean;
  generatedAt: number;
}

export interface IntegrationTransition {
  targetId: number;
  targetName: string;
  prevHealthy: boolean | null;
  curHealthy: boolean;
  /** Same meaning as ServiceTransition.shouldNotify (see lib/checks/runner.ts). */
  shouldNotify: boolean;
  /** The target's current one-line summary (e.g. "42 devices online, 1 alert"),
   * carried along so a subscriber email can say more than just healthy/unhealthy. */
  summary: string;
}

const TTL_MS = 60_000;
let cache: { data: IntegrationsPayload; expiresAt: number } | null = null;
let inflight: Promise<IntegrationsPayload> | null = null;

/**
 * Marks each item ignored/not (per lib/integrationIgnore.ts) and recomputes `healthy`
 * from that, rather than trusting the integration's own `healthy` - every integration
 * that flows through this generic cache (unifi/sophos_central/sophos_xgs/goto_connect/
 * meraki - PowerStore/Proxmox/PBS have their own bespoke acknowledge system already
 * and never reach here) derives `healthy` purely from `items.every(i => i.ok !== false)`,
 * so recomputing it here after ignoring is equivalent to what each integration would
 * report if the ignored row simply weren't unhealthy, without needing every
 * integration's fetchStatus to know about ignore state at all.
 */
function applyIgnores(targetId: number, status: IntegrationStatus): IntegrationStatusPayload {
  const ignoredKeys = getIgnoredKeys(targetId);
  const items: IntegrationItemPayload[] = status.items.map((item) => ({ ...item, ignored: ignoredKeys.has(item.key) }));
  const healthy = items.every((item) => item.ok !== false || item.ignored);
  return { ...status, items, healthy };
}

/** Every enabled marketplace target is queried independently (one bad/misconfigured
 * target never hides the others), dispatched by catalog key - same "each target is
 * its own card, unreachable ones don't hide the rest" shape as storageCache/pbsCache.
 * PowerStore/Proxmox/PBS are excluded (see hasBespokeDisplay in lib/integrations/
 * types.ts) since they have their own cache/display already; without this they'd be
 * queried and shown twice. */
async function computeIntegrations(): Promise<IntegrationsPayload> {
  const enabledTargets = db
    .select()
    .from(integrationTargets)
    .where(eq(integrationTargets.enabled, true))
    .all()
    .filter((t) => !getIntegrationCatalogMeta(t.integration)?.hasBespokeDisplay);

  const smsAvailable = isGotoSmsAvailable();

  if (enabledTargets.length === 0) {
    return { enabled: false, targets: [], smsAvailable, generatedAt: Date.now() };
  }

  const targets = await Promise.all(
    enabledTargets.map(async (t) => {
      const entry = getIntegrationCatalogEntry(t.integration);
      const rawStatus: IntegrationStatus = entry
        ? await entry.fetchStatus(parseIntegrationConfig(t.config))
        : { ok: false, error: `Unknown integration "${t.integration}"`, diagnostics: [], healthy: false, summary: "", items: [] };
      const status = applyIgnores(t.id, rawStatus);
      return { id: t.id, integration: t.integration, name: t.name, status };
    })
  );

  return { enabled: true, targets, smsAvailable, generatedAt: Date.now() };
}

/** Diffs each target's current healthy/unhealthy reading against its last-persisted
 * one (integration_health_status), same transition/notify-delay logic as
 * runServiceChecks/runSiteChecks. Targets whose catalog entry sets
 * `affectsOverallStatus: false` (currently only sophos_central) are skipped entirely -
 * a security/posture signal there isn't an "infrastructure is down" event, same
 * reasoning that already keeps it out of the overall status banner. */
function diffAndPersistIntegrationHealth(payload: IntegrationsPayload): IntegrationTransition[] {
  const cfg = db.select().from(settings).get();
  const notifyDelayS = (cfg?.notifyDownAfterMinutes ?? 0) * 60;
  const now = Math.floor(Date.now() / 1000);
  const transitions: IntegrationTransition[] = [];

  for (const t of payload.targets) {
    if (getIntegrationCatalogMeta(t.integration)?.affectsOverallStatus === false) continue;

    const curHealthy = isIntegrationHealthy(t.status);
    const prev = db.select().from(integrationHealthStatus).where(eq(integrationHealthStatus.targetId, t.id)).get();
    const prevHealthy = prev?.healthy ?? null;

    let wentUnhealthyAt = prev?.wentUnhealthyAt ?? null;
    let lastUnhealthyAt = prev?.lastUnhealthyAt ?? null;
    let lastUnhealthyDurationS = prev?.lastUnhealthyDurationS ?? null;
    let downNotified = prev?.downNotified ?? false;

    if (!curHealthy && prevHealthy !== false) {
      wentUnhealthyAt = now;
      lastUnhealthyAt = now;
      downNotified = false;
    } else if (curHealthy && prevHealthy === false && wentUnhealthyAt) {
      lastUnhealthyDurationS = now - wentUnhealthyAt;
      transitions.push({ targetId: t.id, targetName: t.name, prevHealthy, curHealthy, shouldNotify: downNotified, summary: t.status.summary });
      wentUnhealthyAt = null;
      downNotified = false;
    }

    if (!curHealthy && !downNotified && wentUnhealthyAt !== null && now - wentUnhealthyAt >= notifyDelayS) {
      downNotified = true;
      transitions.push({ targetId: t.id, targetName: t.name, prevHealthy, curHealthy, shouldNotify: true, summary: t.status.summary });
    }

    db.insert(integrationHealthStatus)
      .values({ targetId: t.id, healthy: curHealthy, wentUnhealthyAt, lastUnhealthyAt, lastUnhealthyDurationS, lastCheckedAt: now, downNotified })
      .onConflictDoUpdate({
        target: integrationHealthStatus.targetId,
        set: { healthy: curHealthy, wentUnhealthyAt, lastUnhealthyAt, lastUnhealthyDurationS, lastCheckedAt: now, downNotified },
      })
      .run();
  }

  return transitions;
}

/** Forces a fresh check (bypassing the 60s cache) and persists/diffs health, for the
 * background scheduler (instrumentation-node.ts) so an unhealthy transition is still
 * caught even with zero visitors - mirrors runServiceChecks/runSiteChecks. Doesn't
 * notify itself; the caller does, same convention as those two. */
export async function runIntegrationHealthChecks(): Promise<{ payload: IntegrationsPayload; transitions: IntegrationTransition[] }> {
  const payload = await computeIntegrations();
  const transitions = diffAndPersistIntegrationHealth(payload);
  return { payload, transitions };
}

/** Cached (60s) marketplace snapshot, with in-flight de-dupe like the storage cache.
 * Also diffs/persists health and fires notifications on a real cache-miss compute -
 * same dual-path convention as lib/statusCache.ts's computeStatus, so a status-page
 * poll (likely far more frequent than the 2-minute scheduler) doesn't leave a
 * transition unnoticed until the next scheduled cycle. */
export async function getIntegrationsStatus(): Promise<IntegrationsPayload> {
  const now = Date.now();
  if (cache && cache.expiresAt > now) return cache.data;
  if (inflight) return inflight;

  inflight = runIntegrationHealthChecks()
    .then(({ payload, transitions }) => {
      cache = { data: payload, expiresAt: Date.now() + TTL_MS };
      if (transitions.length > 0) {
        void notifyIntegrationTransitions(transitions).catch((err) => console.error("[integrations] notifyIntegrationTransitions failed", err));
      }
      return payload;
    })
    .finally(() => {
      inflight = null;
    });

  return inflight;
}

export function invalidateIntegrationsCache(): void {
  cache = null;
}

export function isIntegrationHealthy(status: IntegrationStatus): boolean {
  return status.ok && status.healthy;
}

/** True unless marketplace integrations are enabled and something they're watching is
 * unhealthy - same "invisible when off" fold-in as isStorageHealthy/isPbsAllHealthy. */
export function isIntegrationsAllHealthy(payload: IntegrationsPayload | null): boolean {
  if (!payload?.enabled) return true;
  return payload.targets.every((t) => isIntegrationHealthy(t.status));
}
