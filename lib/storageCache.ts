import { db } from "./db/client";
import { settings } from "./db/schema";
import { fetchPowerstoreStatus, type PowerstoreStatus } from "./integrations/powerstore";
import { fetchProxmoxStorageStatus, type ProxmoxStatus } from "./integrations/proxmox";

export interface StoragePayload {
  enabled: boolean;
  powerstore: PowerstoreStatus | null;
  proxmox: ProxmoxStatus | null;
  generatedAt: number;
}

const TTL_MS = 60_000;
let cache: { data: StoragePayload; expiresAt: number } | null = null;
let inflight: Promise<StoragePayload> | null = null;

async function computeStorage(): Promise<StoragePayload> {
  const cfg = db.select().from(settings).get();
  if (!cfg?.storageIntegrationEnabled) {
    return { enabled: false, powerstore: null, proxmox: null, generatedAt: Date.now() };
  }

  const [powerstore, proxmox] = await Promise.all([
    cfg.powerstoreHost && cfg.powerstoreUsername && cfg.powerstorePassword
      ? fetchPowerstoreStatus({ host: cfg.powerstoreHost, username: cfg.powerstoreUsername, password: cfg.powerstorePassword })
      : null,
    cfg.proxmoxHost && cfg.proxmoxTokenId && cfg.proxmoxTokenSecret
      ? fetchProxmoxStorageStatus({
          host: cfg.proxmoxHost,
          tokenId: cfg.proxmoxTokenId,
          tokenSecret: cfg.proxmoxTokenSecret,
          storageId: cfg.proxmoxStorageId,
        })
      : null,
  ]);

  return { enabled: true, powerstore, proxmox, generatedAt: Date.now() };
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
