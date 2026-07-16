import { fetch as undiciFetch } from "undici";
import { insecureAgent } from "@/lib/insecureAgent";

export interface ProxmoxConfig {
  host: string;
  tokenId: string;
  tokenSecret: string;
  storageId?: string | null;
}

export interface ProxmoxStorageEntry {
  node: string;
  storage: string;
  active: boolean;
  usedPercent?: number;
}

export interface ProxmoxStatus {
  ok: boolean;
  error?: string;
  storages: ProxmoxStorageEntry[];
}

function baseUrl(host: string): string {
  const trimmed = host.trim().replace(/\/$/, "");
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

/**
 * Queries the Proxmox VE API (cluster/resources?type=storage) for whether each node
 * currently sees a given storage (e.g. one backed by PowerStore) as active, using
 * token auth: https://pve.proxmox.com/wiki/Proxmox_VE_API#API_Tokens
 */
export async function fetchProxmoxStorageStatus(cfg: ProxmoxConfig): Promise<ProxmoxStatus> {
  try {
    const url = `${baseUrl(cfg.host)}/api2/json/cluster/resources?type=storage`;
    const res = await undiciFetch(url, {
      headers: { Authorization: `PVEAPIToken=${cfg.tokenId}=${cfg.tokenSecret}` },
      dispatcher: insecureAgent,
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) throw new Error(`Proxmox API returned HTTP ${res.status}`);

    const body = (await res.json()) as { data?: Record<string, unknown>[] };
    const rows = body.data ?? [];
    const filtered = cfg.storageId ? rows.filter((r) => r.storage === cfg.storageId) : rows;

    return {
      ok: true,
      storages: filtered.map((r) => {
        const maxdisk = typeof r.maxdisk === "number" ? r.maxdisk : undefined;
        const disk = typeof r.disk === "number" ? r.disk : undefined;
        return {
          node: typeof r.node === "string" ? r.node : "unknown",
          storage: typeof r.storage === "string" ? r.storage : "unknown",
          active: r.status === "available",
          usedPercent: maxdisk && disk !== undefined && maxdisk > 0 ? (disk / maxdisk) * 100 : undefined,
        };
      }),
    };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Failed to query Proxmox", storages: [] };
  }
}
