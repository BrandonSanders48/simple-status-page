import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { services, serviceStatus, outageLog } from "@/lib/db/schema";
import { checkHttp, httpSchemeFor, isHttpType } from "./http";
import { checkDns, isDnsType } from "./dns";
import { checkTcp } from "./tcp";
import { checkPing } from "./ping";

export type Service = typeof services.$inferSelect;

export interface ServiceCheckResult {
  service: Service;
  up: boolean;
  wentDownAt: number | null;
  lastDownAt: number | null;
  lastDownDurationS: number | null;
}

export interface ServiceTransition {
  serviceId: number;
  serviceName: string;
  prevStatus: "up" | "down" | null;
  curStatus: "up" | "down";
  /** True unless this is just establishing an initial "up" baseline on first-ever check. */
  shouldNotify: boolean;
}

/** Dispatches a single service to the right protocol-aware check. */
export async function checkOneService(svc: Service): Promise<boolean> {
  if (svc.port === null) {
    return checkPing(svc.host);
  }
  if (isHttpType(svc.type)) {
    return checkHttp(svc.host, svc.port, httpSchemeFor(svc.type, svc.port));
  }
  if (isDnsType(svc.type)) {
    return checkDns(svc.host, svc.port);
  }
  return checkTcp(svc.host, svc.port);
}

/**
 * Runs every configured service check in parallel, persists per-service status/outage
 * history, and returns both the raw results and the list of status transitions (so a
 * caller can decide whether to email subscribers). This is the single canonical check
 * path — both the live /api/status route and the periodic background job call this,
 * instead of each running its own independent check+persist logic.
 */
export async function runServiceChecks(): Promise<{
  results: ServiceCheckResult[];
  transitions: ServiceTransition[];
}> {
  const allServices = db.select().from(services).all();
  const checked = await Promise.allSettled(allServices.map((svc) => checkOneService(svc)));

  const results: ServiceCheckResult[] = [];
  const transitions: ServiceTransition[] = [];
  const now = Math.floor(Date.now() / 1000);

  for (let i = 0; i < allServices.length; i++) {
    const svc = allServices[i]!;
    const outcome = checked[i];
    const up = outcome !== undefined && outcome.status === "fulfilled" ? outcome.value : false;
    const curStatus: "up" | "down" = up ? "up" : "down";
    const prev = db.select().from(serviceStatus).where(eq(serviceStatus.serviceId, svc.id)).get();
    const prevStatus = (prev?.status as "up" | "down" | null) ?? null;

    let wentDownAt = prev?.wentDownAt ?? null;
    let lastDownAt = prev?.lastDownAt ?? null;
    let lastDownDurationS = prev?.lastDownDurationS ?? null;

    if (curStatus === "down" && prevStatus !== "down") {
      wentDownAt = now;
      lastDownAt = now;
    } else if (curStatus === "up" && prevStatus === "down" && wentDownAt) {
      lastDownDurationS = now - wentDownAt;
      db.insert(outageLog)
        .values({
          serviceId: svc.id,
          serviceName: svc.name,
          wentDownAt,
          cameUpAt: now,
          durationS: lastDownDurationS,
        })
        .run();

      const rows = db.select({ id: outageLog.id }).from(outageLog).all();
      if (rows.length > 200) {
        const toTrim = rows.length - 200;
        const oldestIds = rows
          .map((r) => r.id)
          .sort((a, b) => a - b)
          .slice(0, toTrim);
        for (const id of oldestIds) db.delete(outageLog).where(eq(outageLog.id, id)).run();
      }
      wentDownAt = null;
    }

    db.insert(serviceStatus)
      .values({
        serviceId: svc.id,
        status: curStatus,
        wentDownAt,
        lastDownAt,
        lastDownDurationS,
        lastCheckedAt: now,
      })
      .onConflictDoUpdate({
        target: serviceStatus.serviceId,
        set: { status: curStatus, wentDownAt, lastDownAt, lastDownDurationS, lastCheckedAt: now },
      })
      .run();

    results.push({ service: svc, up, wentDownAt, lastDownAt, lastDownDurationS });

    // Notify on any real transition, including a service found down on its very first
    // check (no prior baseline) — but not when merely establishing an initial "up"
    // baseline on a fresh install.
    if (prevStatus !== curStatus) {
      const shouldNotify = !(prevStatus === null && curStatus === "up");
      transitions.push({ serviceId: svc.id, serviceName: svc.name, prevStatus, curStatus, shouldNotify });
    }
  }

  return { results, transitions };
}
