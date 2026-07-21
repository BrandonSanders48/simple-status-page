import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { sites, siteStatus, siteOutageLog, settings } from "@/lib/db/schema";
import { checkPing } from "./ping";
import { checkTcp } from "./tcp";

export type Site = typeof sites.$inferSelect;

/** A site's own tunnel/link check, independent of any service assigned to it - lets
 * the status page tell "this whole site's link is down" apart from "just one of its
 * services happens to be down". Same null-means-"not configured" convention as
 * checkLocalNetwork/checkWideNetwork: a site with no tunnelHost is just a grouping
 * label and never affects health. */
export async function checkSiteTunnel(tunnelHost: string | null, tunnelPort: number | null): Promise<boolean | null> {
  if (!tunnelHost) return null;
  return tunnelPort === null ? checkPing(tunnelHost) : checkTcp(tunnelHost, tunnelPort);
}

export interface SiteCheckResult {
  site: Site;
  /** null when the site has no tunnelHost configured. */
  tunnelOk: boolean | null;
}

export interface SiteTransition {
  siteId: number;
  siteName: string;
  prevStatus: "up" | "down" | null;
  curStatus: "up" | "down";
  /** Same meaning as ServiceTransition.shouldNotify (see lib/checks/runner.ts): false
   * for an initial baseline, a "down" that hasn't yet lasted notifyDownAfterMinutes,
   * or a recovery from a "down" that was never itself notified. */
  shouldNotify: boolean;
}

/**
 * Runs every site's tunnel check in parallel and persists per-site status/outage
 * history for the ones with a tunnelHost configured - mirrors runServiceChecks in
 * lib/checks/runner.ts so both the live /api/status route and the periodic background
 * job share one canonical check+persist+transition path for sites. Sites with no
 * tunnelHost are skipped entirely: no row is written, and they never produce a
 * transition (nothing to notify about).
 */
export async function runSiteChecks(): Promise<{ results: SiteCheckResult[]; transitions: SiteTransition[] }> {
  const allSites = db.select().from(sites).all();
  const checked = await Promise.allSettled(allSites.map((s) => checkSiteTunnel(s.tunnelHost, s.tunnelPort)));

  const cfg = db.select().from(settings).get();
  const notifyDelayS = (cfg?.notifyDownAfterMinutes ?? 0) * 60;

  const results: SiteCheckResult[] = [];
  const transitions: SiteTransition[] = [];
  const now = Math.floor(Date.now() / 1000);

  for (let i = 0; i < allSites.length; i++) {
    const site = allSites[i]!;
    const outcome = checked[i];
    const tunnelOk = outcome !== undefined && outcome.status === "fulfilled" ? outcome.value : null;
    results.push({ site, tunnelOk });

    if (tunnelOk === null) continue;

    const curStatus: "up" | "down" = tunnelOk ? "up" : "down";
    const prev = db.select().from(siteStatus).where(eq(siteStatus.siteId, site.id)).get();
    const prevStatus = (prev?.status as "up" | "down" | null) ?? null;

    let wentDownAt = prev?.wentDownAt ?? null;
    let lastDownAt = prev?.lastDownAt ?? null;
    let lastDownDurationS = prev?.lastDownDurationS ?? null;
    let downNotified = prev?.downNotified ?? false;

    if (curStatus === "down" && prevStatus !== "down") {
      wentDownAt = now;
      lastDownAt = now;
      downNotified = false;
    } else if (curStatus === "up" && prevStatus === "down" && wentDownAt) {
      lastDownDurationS = now - wentDownAt;
      db.insert(siteOutageLog)
        .values({
          siteId: site.id,
          siteName: site.name,
          wentDownAt,
          cameUpAt: now,
          durationS: lastDownDurationS,
        })
        .run();

      const rows = db.select({ id: siteOutageLog.id }).from(siteOutageLog).all();
      if (rows.length > 200) {
        const toTrim = rows.length - 200;
        const oldestIds = rows
          .map((r) => r.id)
          .sort((a, b) => a - b)
          .slice(0, toTrim);
        for (const id of oldestIds) db.delete(siteOutageLog).where(eq(siteOutageLog.id, id)).run();
      }

      transitions.push({ siteId: site.id, siteName: site.name, prevStatus, curStatus, shouldNotify: downNotified });

      wentDownAt = null;
      downNotified = false;
    }

    if (curStatus === "down" && !downNotified && wentDownAt !== null && now - wentDownAt >= notifyDelayS) {
      downNotified = true;
      transitions.push({ siteId: site.id, siteName: site.name, prevStatus, curStatus, shouldNotify: true });
    }

    db.insert(siteStatus)
      .values({
        siteId: site.id,
        status: curStatus,
        wentDownAt,
        lastDownAt,
        lastDownDurationS,
        lastCheckedAt: now,
        downNotified,
      })
      .onConflictDoUpdate({
        target: siteStatus.siteId,
        set: { status: curStatus, wentDownAt, lastDownAt, lastDownDurationS, lastCheckedAt: now, downNotified },
      })
      .run();
  }

  return { results, transitions };
}
