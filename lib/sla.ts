import { and, eq, gte, isNotNull } from "drizzle-orm";
import { db } from "./db/client";
import { outageLog, serviceStatus } from "./db/schema";

const PERIOD_DAYS: Record<string, number> = {
  weekly: 7,
  monthly: 30,
  quarterly: 90,
};

interface Interval {
  start: number;
  end: number;
}

/** Merges overlapping/adjacent intervals so simultaneous outages across multiple
 * services aren't double-counted as separate downtime. */
function mergeIntervals(intervals: Interval[]): Interval[] {
  if (intervals.length === 0) return [];
  const sorted = [...intervals].sort((a, b) => a.start - b.start);
  const merged: Interval[] = [sorted[0]!];
  for (const cur of sorted.slice(1)) {
    const last = merged[merged.length - 1]!;
    if (cur.start <= last.end) {
      last.end = Math.max(last.end, cur.end);
    } else {
      merged.push(cur);
    }
  }
  return merged;
}

export interface UptimeResult {
  uptimePercent: number;
  periodDays: number;
  downtimeSeconds: number;
  periodSeconds: number;
}

/**
 * Computes overall uptime across all monitored services for the given reporting
 * period, treating simultaneous outages on different services as a single system
 * outage window rather than summing their durations separately.
 */
export function computeUptime(reportingPeriod: string): UptimeResult {
  const periodDays = PERIOD_DAYS[reportingPeriod] ?? 30;
  const now = Math.floor(Date.now() / 1000);
  const periodStart = now - periodDays * 86400;
  const periodSeconds = periodDays * 86400;

  const completedOutages = db
    .select({ wentDownAt: outageLog.wentDownAt, cameUpAt: outageLog.cameUpAt })
    .from(outageLog)
    .where(gte(outageLog.cameUpAt, periodStart))
    .all();

  const ongoingOutages = db
    .select({ wentDownAt: serviceStatus.wentDownAt })
    .from(serviceStatus)
    .where(and(eq(serviceStatus.status, "down"), isNotNull(serviceStatus.wentDownAt)))
    .all();

  const intervals: Interval[] = [];
  for (const o of completedOutages) {
    intervals.push({ start: Math.max(o.wentDownAt, periodStart), end: Math.min(o.cameUpAt, now) });
  }
  for (const s of ongoingOutages) {
    if (s.wentDownAt) {
      intervals.push({ start: Math.max(s.wentDownAt, periodStart), end: now });
    }
  }

  const merged = mergeIntervals(intervals.filter((i) => i.end > i.start));
  const downtimeSeconds = merged.reduce((sum, i) => sum + (i.end - i.start), 0);
  const uptimePercent = periodSeconds > 0 ? Math.max(0, Math.min(100, ((periodSeconds - downtimeSeconds) / periodSeconds) * 100)) : 100;

  return { uptimePercent, periodDays, downtimeSeconds, periodSeconds };
}
