import { db } from "./db/client";
import { settings, ispMapEntries } from "./db/schema";
import { runServiceChecks } from "./checks/runner";
import { checkLocalNetwork, checkWideNetwork, getPublicIp } from "./checks/network";
import { runSiteChecks } from "./checks/site";
import { notifyTransitions, notifySiteTransitions } from "./notifier";
import type { AdCheckResult } from "./checks/ad";

export interface StatusServicePayload {
  id: number;
  name: string;
  type: string;
  description: string | null;
  host: string;
  port: number | null;
  visible: boolean;
  up: boolean;
  wentDownAt: number | null;
  lastDownAt: number | null;
  lastDownDurationS: number | null;
  siteId: number | null;
  /** Per-port breakdown, present only for type "ad" services (see lib/checks/ad.ts)
   * -- lets the public page show which specific piece failed as its own tag,
   * instead of just the single service-level Up/Down. */
  adChecks?: AdCheckResult[];
}

export interface SitePayload {
  id: number;
  name: string;
  /** null when the site has no tunnelHost configured -- a pure grouping label that
   * never affects health, same "invisible when off" convention as everything else. */
  tunnelOk: boolean | null;
}

export interface StatusPayload {
  local: { ok: boolean | null; text: string };
  wide: { ok: boolean | null; text: string };
  services: StatusServicePayload[];
  sites: SitePayload[];
  errors: number;
  generatedAt: number;
}

const TTL_MS = 30_000;
let cache: { data: StatusPayload; expiresAt: number } | null = null;
let inflight: Promise<StatusPayload> | null = null;

async function computeStatus(): Promise<StatusPayload> {
  const cfg = db.select().from(settings).get();
  const isp = db.select().from(ispMapEntries).all();

  const [{ results, transitions }, publicIp, { results: siteResults, transitions: siteTransitions }] = await Promise.all([
    runServiceChecks(),
    getPublicIp(),
    runSiteChecks(),
  ]);

  const sitePayloads: SitePayload[] = siteResults.map((r) => ({ id: r.site.id, name: r.site.name, tunnelOk: r.tunnelOk }));

  // Both runServiceChecks() and runSiteChecks() persist status and compute transitions
  // by diffing against the previous DB row, so whichever caller (this route or the
  // background scheduler) happens to run first is the only one that will ever see a
  // given transition. Notify here too, or transitions observed by a status-page poll
  // (far more frequent than the 2-minute scheduler) would be silently discarded and
  // subscribers would never be emailed.
  if (transitions.length > 0) {
    void notifyTransitions(transitions).catch((err) => console.error("[status] notifyTransitions failed", err));
  }
  if (siteTransitions.length > 0) {
    void notifySiteTransitions(siteTransitions).catch((err) => console.error("[status] notifySiteTransitions failed", err));
  }

  const ispName = isp.find((e) => e.ip === publicIp)?.name ?? null;

  const [local, wide] = await Promise.all([
    checkLocalNetwork(cfg?.gatewayHost ?? null),
    checkWideNetwork(cfg?.publicDnsHost ?? null, publicIp, ispName),
  ]);

  let errors = 0;
  const services: StatusServicePayload[] = [];
  for (const r of results) {
    if (!r.up) errors++;
    if (!r.service.visible) continue;
    services.push({
      id: r.service.id,
      name: r.service.name,
      type: r.service.type,
      description: r.service.description,
      host: r.service.host,
      port: r.service.port,
      visible: r.service.visible,
      up: r.up,
      wentDownAt: r.wentDownAt,
      lastDownAt: r.lastDownAt,
      lastDownDurationS: r.lastDownDurationS,
      siteId: r.service.siteId,
      adChecks: r.adChecks,
    });
  }

  return { local, wide, services, sites: sitePayloads, errors, generatedAt: Date.now() };
}

/** Cached (30s) status snapshot, with in-flight de-dupe so concurrent pollers share one check cycle. */
export async function getStatus(): Promise<StatusPayload> {
  const now = Date.now();
  if (cache && cache.expiresAt > now) return cache.data;
  if (inflight) return inflight;

  inflight = computeStatus()
    .then((data) => {
      cache = { data, expiresAt: Date.now() + TTL_MS };
      return data;
    })
    .finally(() => {
      inflight = null;
    });

  return inflight;
}

export function invalidateStatusCache(): void {
  cache = null;
}
