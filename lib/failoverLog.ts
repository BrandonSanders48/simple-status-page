import { desc } from "drizzle-orm";
import { db } from "./db/client";
import { failoverActions } from "./db/schema";

export type FailoverActionType = "start_vms" | "shutdown_vms" | "promote_metro" | "reprotect_metro";

/** Records one Failover tab action (a whole VM-range batch, or one Metro session
 * call) to the audit log - called from each action route regardless of outcome, so
 * failed attempts are just as visible as successful ones. */
export function recordFailoverAction(entry: {
  action: FailoverActionType;
  targetName: string;
  detail: string;
  outcome: "success" | "error";
  errorMessage?: string;
}): void {
  db.insert(failoverActions)
    .values({
      action: entry.action,
      targetName: entry.targetName,
      detail: entry.detail,
      outcome: entry.outcome,
      errorMessage: entry.errorMessage,
    })
    .run();
}

export function getRecentFailoverActions(limit = 20) {
  return db.select().from(failoverActions).orderBy(desc(failoverActions.id)).limit(limit).all();
}
