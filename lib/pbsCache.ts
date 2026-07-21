import { eq, and } from "drizzle-orm";
import { db } from "./db/client";
import { integrationTargets, pbsAcknowledgedTasks } from "./db/schema";
import { fetchPbsStatus, type PbsStatus } from "./integrations/pbs";
import { parseIntegrationConfig } from "./integrationTargets";

export interface PbsTargetPayload {
  id: number;
  name: string;
  status: PbsStatus;
}

export interface PbsPayload {
  enabled: boolean;
  targets: PbsTargetPayload[];
  generatedAt: number;
}

const TTL_MS = 60_000;
let cache: { data: PbsPayload; expiresAt: number } | null = null;
let inflight: Promise<PbsPayload> | null = null;

/** Overlays this target's acknowledged-task ids onto a freshly fetched status, then
 * recomputes lastRunHealthy so a cleared failure stops flipping the target (and the
 * Backups tab badge) to unhealthy - while still showing the task itself in the list. */
function applyAcknowledgments(targetId: number, status: PbsStatus): PbsStatus {
  if (status.tasks.length === 0) return status;
  const acked = new Set(
    db.select().from(pbsAcknowledgedTasks).where(eq(pbsAcknowledgedTasks.targetId, targetId)).all().map((r) => r.taskId)
  );
  if (acked.size === 0) return status;

  const tasks = status.tasks.map((t) => (acked.has(t.id) ? { ...t, acknowledged: true } : t));
  return { ...status, tasks, lastRunHealthy: tasks.every((t) => t.status === "OK" || t.acknowledged) };
}

/** PBS lives in the shared integration_targets table (see lib/db/schema.ts), filtered
 * by integration key, like any other marketplace integration. */
async function computePbs(): Promise<PbsPayload> {
  const enabledTargets = db
    .select()
    .from(integrationTargets)
    .where(and(eq(integrationTargets.integration, "pbs"), eq(integrationTargets.enabled, true)))
    .all();

  if (enabledTargets.length === 0) {
    return { enabled: false, targets: [], generatedAt: Date.now() };
  }

  const targets = await Promise.all(
    enabledTargets.map(async (t) => {
      const cfg = parseIntegrationConfig(t.config);
      return {
        id: t.id,
        name: t.name,
        status: applyAcknowledgments(
          t.id,
          await fetchPbsStatus({ host: cfg.host ?? "", tokenId: cfg.tokenId ?? "", tokenSecret: cfg.tokenSecret ?? "" })
        ),
      };
    })
  );

  return { enabled: true, targets, generatedAt: Date.now() };
}

/** Cached (60s) PBS snapshot, with in-flight de-dupe like the storage cache. */
export async function getPbsStatus(): Promise<PbsPayload> {
  const now = Date.now();
  if (cache && cache.expiresAt > now) return cache.data;
  if (inflight) return inflight;

  inflight = computePbs()
    .then((data) => {
      cache = { data, expiresAt: Date.now() + TTL_MS };
      return data;
    })
    .finally(() => {
      inflight = null;
    });

  return inflight;
}

export function invalidatePbsCache(): void {
  cache = null;
}
