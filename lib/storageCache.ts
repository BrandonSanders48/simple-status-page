import { eq } from "drizzle-orm";
import { db } from "./db/client";
import { powerstoreTargets, proxmoxTargets } from "./db/schema";
import { fetchPowerstoreStatus, type PowerstoreStatus } from "./integrations/powerstore";
import { fetchProxmoxStorageStatus, type ProxmoxStatus } from "./integrations/proxmox";

export interface PowerstoreTargetPayload {
  id: number;
  name: string;
  status: PowerstoreStatus;
}

export interface ProxmoxTargetPayload {
  id: number;
  name: string;
  status: ProxmoxStatus;
}

export interface StoragePayload {
  enabled: boolean;
  powerstores: PowerstoreTargetPayload[];
  proxmoxes: ProxmoxTargetPayload[];
  generatedAt: number;
}

const TTL_MS = 60_000;
let cache: { data: StoragePayload; expiresAt: number } | null = null;
let inflight: Promise<StoragePayload> | null = null;

/** Multiple PowerStore arrays / Proxmox clusters can be monitored at once (e.g. a main
 * site and a DR site) -- each enabled target is queried independently and shown as its
 * own named card, so one target being unreachable never hides the others. There's no
 * separate master toggle: the panel is active whenever at least one target is enabled. */
async function computeStorage(): Promise<StoragePayload> {
  const psTargets = db.select().from(powerstoreTargets).where(eq(powerstoreTargets.enabled, true)).all();
  const pveTargets = db.select().from(proxmoxTargets).where(eq(proxmoxTargets.enabled, true)).all();

  if (psTargets.length === 0 && pveTargets.length === 0) {
    return { enabled: false, powerstores: [], proxmoxes: [], generatedAt: Date.now() };
  }

  const [powerstores, proxmoxes] = await Promise.all([
    Promise.all(
      psTargets.map(async (t) => ({
        id: t.id,
        name: t.name,
        status: await fetchPowerstoreStatus({ host: t.host, username: t.username, password: t.password }),
      }))
    ),
    Promise.all(
      pveTargets.map(async (t) => ({
        id: t.id,
        name: t.name,
        status: await fetchProxmoxStorageStatus({ host: t.host, tokenId: t.tokenId, tokenSecret: t.tokenSecret, storageId: t.storageId }),
      }))
    ),
  ]);

  return { enabled: true, powerstores, proxmoxes, generatedAt: Date.now() };
}

/** Cached (60s) PowerStore/Proxmox snapshot, with in-flight de-dupe like the status cache. */
export async function getStorageStatus(): Promise<StoragePayload> {
  const now = Date.now();
  if (cache && cache.expiresAt > now) return cache.data;
  if (inflight) return inflight;

  inflight = computeStorage()
    .then((data) => {
      cache = { data, expiresAt: Date.now() + TTL_MS };
      return data;
    })
    .finally(() => {
      inflight = null;
    });

  return inflight;
}

export function invalidateStorageCache(): void {
  cache = null;
}
