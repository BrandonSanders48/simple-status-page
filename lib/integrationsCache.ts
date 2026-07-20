import { eq } from "drizzle-orm";
import { db } from "./db/client";
import { integrationTargets } from "./db/schema";
import { getIntegrationCatalogEntry } from "./integrationRegistry";
import { getIntegrationCatalogMeta } from "./integrationCatalogMeta";
import type { IntegrationStatus } from "./integrations/types";

export interface IntegrationTargetPayload {
  id: number;
  integration: string;
  name: string;
  status: IntegrationStatus;
}

export interface IntegrationsPayload {
  enabled: boolean;
  targets: IntegrationTargetPayload[];
  generatedAt: number;
}

const TTL_MS = 60_000;
let cache: { data: IntegrationsPayload; expiresAt: number } | null = null;
let inflight: Promise<IntegrationsPayload> | null = null;

function parseConfig(raw: string): Record<string, string> {
  try {
    const parsed = JSON.parse(raw);
    return typeof parsed === "object" && parsed !== null ? parsed : {};
  } catch {
    return {};
  }
}

/** Every enabled marketplace target is queried independently (one bad/misconfigured
 * target never hides the others), dispatched by catalog key -- same "each target is
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

  if (enabledTargets.length === 0) {
    return { enabled: false, targets: [], generatedAt: Date.now() };
  }

  const targets = await Promise.all(
    enabledTargets.map(async (t) => {
      const entry = getIntegrationCatalogEntry(t.integration);
      const status: IntegrationStatus = entry
        ? await entry.fetchStatus(parseConfig(t.config))
        : { ok: false, error: `Unknown integration "${t.integration}"`, diagnostics: [], healthy: false, summary: "", items: [] };
      return { id: t.id, integration: t.integration, name: t.name, status };
    })
  );

  return { enabled: true, targets, generatedAt: Date.now() };
}

/** Cached (60s) marketplace snapshot, with in-flight de-dupe like the storage cache. */
export async function getIntegrationsStatus(): Promise<IntegrationsPayload> {
  const now = Date.now();
  if (cache && cache.expiresAt > now) return cache.data;
  if (inflight) return inflight;

  inflight = computeIntegrations()
    .then((data) => {
      cache = { data, expiresAt: Date.now() + TTL_MS };
      return data;
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
 * unhealthy -- same "invisible when off" fold-in as isStorageHealthy/isPbsAllHealthy. */
export function isIntegrationsAllHealthy(payload: IntegrationsPayload | null): boolean {
  if (!payload?.enabled) return true;
  return payload.targets.every((t) => isIntegrationHealthy(t.status));
}
