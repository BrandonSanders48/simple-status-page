import { db } from "./db/client";
import { services, serviceStatus, outageLog } from "./db/schema";

export interface DayUptime {
  date: string; // YYYY-MM-DD (UTC)
  /** null = the service didn't exist yet on that day. */
  upPercent: number | null;
}

const DAY_S = 86400;

function dateStr(unixSeconds: number): string {
  return new Date(unixSeconds * 1000).toISOString().slice(0, 10);
}

function parseSqliteTimestamp(value: string): number {
  // SQLite's CURRENT_TIMESTAMP is UTC, formatted "YYYY-MM-DD HH:MM:SS".
  return Math.floor(new Date(value.replace(" ", "T") + "Z").getTime() / 1000);
}

/**
 * Computes daily uptime percentage per service for the last `days` days, from the
 * closed-outage log plus any currently-ongoing outage. Limited by the same 200-row
 * outage_log retention the rest of the app uses, so very old days may read as 100%
 * once their outage record has been trimmed -- an existing, accepted tradeoff, not
 * something new introduced here.
 */
export function computeUptimeHistory(days: number): Record<number, DayUptime[]> {
  const now = Math.floor(Date.now() / 1000);
  const todayStart = Math.floor(now / DAY_S) * DAY_S;

  const allServices = db.select().from(services).all();
  const allOutages = db.select().from(outageLog).all();
  const allStatus = db.select().from(serviceStatus).all();

  const outagesByService = new Map<number, typeof allOutages>();
  for (const o of allOutages) {
    if (o.serviceId === null) continue;
    const list = outagesByService.get(o.serviceId) ?? [];
    list.push(o);
    outagesByService.set(o.serviceId, list);
  }
  const statusByService = new Map(allStatus.map((s) => [s.serviceId, s]));

  const result: Record<number, DayUptime[]> = {};

  for (const svc of allServices) {
    const outages = outagesByService.get(svc.id) ?? [];
    const status = statusByService.get(svc.id);
    const createdAtS = parseSqliteTimestamp(svc.createdAt);

    const daily: DayUptime[] = [];
    for (let i = days - 1; i >= 0; i--) {
      const dayStart = todayStart - i * DAY_S;
      const dayEnd = Math.min(dayStart + DAY_S, now + 1);
      if (dayEnd <= dayStart) continue;

      if (!Number.isNaN(createdAtS) && dayStart + DAY_S <= createdAtS) {
        daily.push({ date: dateStr(dayStart), upPercent: null });
        continue;
      }

      let downtimeS = 0;
      for (const o of outages) {
        const overlapStart = Math.max(o.wentDownAt, dayStart);
        const overlapEnd = Math.min(o.cameUpAt, dayEnd);
        if (overlapEnd > overlapStart) downtimeS += overlapEnd - overlapStart;
      }
      if (status?.status === "down" && status.wentDownAt) {
        const overlapStart = Math.max(status.wentDownAt, dayStart);
        if (dayEnd > overlapStart) downtimeS += dayEnd - overlapStart;
      }

      const dayLengthS = dayEnd - dayStart;
      const upPercent = dayLengthS > 0 ? Math.max(0, Math.min(100, 100 * (1 - downtimeS / dayLengthS))) : 100;
      daily.push({ date: dateStr(dayStart), upPercent });
    }
    result[svc.id] = daily;
  }

  return result;
}
