import { eq } from "drizzle-orm";
import { db } from "./db/client";
import { pbsTargets } from "./db/schema";
import { fetchPbsStatus, type PbsStatus } from "./integrations/pbs";

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

async function computePbs(): Promise<PbsPayload> {
  const enabledTargets = db.select().from(pbsTargets).where(eq(pbsTargets.enabled, true)).all();

  if (enabledTargets.length === 0) {
    return { enabled: false, targets: [], generatedAt: Date.now() };
  }

  const targets = await Promise.all(
    enabledTargets.map(async (t) => ({
      id: t.id,
      name: t.name,
      status: await fetchPbsStatus({ host: t.host, tokenId: t.tokenId, tokenSecret: t.tokenSecret }),
    }))
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
