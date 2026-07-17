import { fetch as undiciFetch } from "undici";
import { insecureAgent } from "@/lib/insecureAgent";

export interface ProxmoxConfig {
  host: string;
  tokenId: string;
  tokenSecret: string;
  storageId?: string | null;
}

export interface ProxmoxNode {
  name: string;
  online: boolean;
  cpuPercent?: number;
  memPercent?: number;
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
  /** Cluster quorum: true/false when clustered, null for a standalone node (or if it
   * couldn't be determined) -- callers should treat null as "not applicable", not bad. */
  quorate: boolean | null;
  nodes: ProxmoxNode[];
  storages: ProxmoxStorageEntry[];
  /** Non-fatal notes about calls that failed (e.g. no cluster configured) -- surfaced
   * in the admin Test Connection summary. */
  diagnostics: string[];
}

type JsonRecord = Record<string, unknown>;
type GetResult = { data: unknown; error: null } | { data: null; error: string };

function baseUrl(host: string): string {
  const trimmed = host.trim().replace(/\/$/, "");
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

async function get(cfg: ProxmoxConfig, path: string, timeoutMs = 6000): Promise<GetResult> {
  try {
    const res = await undiciFetch(`${baseUrl(cfg.host)}${path}`, {
      headers: { Authorization: `PVEAPIToken=${cfg.tokenId}=${cfg.tokenSecret}` },
      dispatcher: insecureAgent,
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return { data: null, error: `${path} returned HTTP ${res.status}${body ? `: ${body.slice(0, 200)}` : ""}` };
    }
    return { data: await res.json(), error: null };
  } catch (err) {
    return { data: null, error: err instanceof Error ? `${path}: ${err.message}` : `${path}: request failed` };
  }
}

async function post(cfg: ProxmoxConfig, path: string, timeoutMs = 10000): Promise<GetResult> {
  try {
    const res = await undiciFetch(`${baseUrl(cfg.host)}${path}`, {
      method: "POST",
      headers: { Authorization: `PVEAPIToken=${cfg.tokenId}=${cfg.tokenSecret}` },
      dispatcher: insecureAgent,
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return { data: null, error: `${path} returned HTTP ${res.status}${body ? `: ${body.slice(0, 200)}` : ""}` };
    }
    return { data: await res.json(), error: null };
  } catch (err) {
    return { data: null, error: err instanceof Error ? `${path}: ${err.message}` : `${path}: request failed` };
  }
}

function rowsOf(result: GetResult): JsonRecord[] {
  if (result.error) return [];
  const body = result.data as { data?: JsonRecord[] };
  return body?.data ?? [];
}

/** Per-node status/CPU/memory from /nodes -- always available, clustered or not. */
async function fetchNodes(cfg: ProxmoxConfig, diagnostics: string[]): Promise<ProxmoxNode[]> {
  const result = await get(cfg, "/api2/json/nodes");
  if (result.error) {
    diagnostics.push(result.error);
    return [];
  }
  return rowsOf(result).map((r) => ({
    name: typeof r.node === "string" ? r.node : "unknown",
    online: r.status === "online",
    cpuPercent: typeof r.cpu === "number" ? r.cpu * 100 : undefined,
    memPercent: typeof r.mem === "number" && typeof r.maxmem === "number" && r.maxmem > 0 ? (r.mem / r.maxmem) * 100 : undefined,
  }));
}

/** Cluster quorum from /cluster/status -- absent (not an error) on a standalone node. */
async function fetchQuorate(cfg: ProxmoxConfig, diagnostics: string[]): Promise<boolean | null> {
  const result = await get(cfg, "/api2/json/cluster/status");
  if (result.error) {
    diagnostics.push(result.error);
    return null;
  }
  const clusterEntry = rowsOf(result).find((r) => r.type === "cluster");
  if (!clusterEntry) return null;
  return clusterEntry.quorate === 1 || clusterEntry.quorate === true;
}

/**
 * Queries the Proxmox VE API for cluster health (node online/offline, CPU/memory,
 * quorum) and whether each node currently sees a given storage (e.g. one backed by
 * PowerStore) as active, using token auth:
 * https://pve.proxmox.com/wiki/Proxmox_VE_API#API_Tokens
 */
export async function fetchProxmoxStorageStatus(cfg: ProxmoxConfig): Promise<ProxmoxStatus> {
  const diagnostics: string[] = [];
  try {
    const [nodes, quorate, storageResult] = await Promise.all([
      fetchNodes(cfg, diagnostics),
      fetchQuorate(cfg, diagnostics),
      get(cfg, "/api2/json/cluster/resources?type=storage"),
    ]);

    if (storageResult.error) throw new Error(storageResult.error);

    const rows = rowsOf(storageResult);
    const filtered = cfg.storageId ? rows.filter((r) => r.storage === cfg.storageId) : rows;

    return {
      ok: true,
      quorate,
      nodes,
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
      diagnostics,
    };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Failed to query Proxmox",
      quorate: null,
      nodes: [],
      storages: [],
      diagnostics,
    };
  }
}

export interface ProxmoxVm {
  vmid: number;
  name: string;
  node: string;
  status: string; // "running" | "stopped" | ...
}

/** Every QEMU VM in the cluster, wherever it currently lives -- the Failover tab uses
 * this to preview/start VMs by id range without needing to know in advance which node
 * each one is on. /cluster/resources only accepts type=vm (which covers both QEMU VMs
 * and LXC containers, each row tagged with its own r.type) -- there's no type=qemu, so
 * containers are filtered out here rather than at the API. */
export async function listProxmoxVms(cfg: ProxmoxConfig): Promise<{ ok: boolean; error?: string; vms: ProxmoxVm[] }> {
  const result = await get(cfg, "/api2/json/cluster/resources?type=vm");
  if (result.error) return { ok: false, error: result.error, vms: [] };
  const vms = rowsOf(result)
    .filter((r) => r.type === "qemu")
    .map((r) => ({
      vmid: typeof r.vmid === "number" ? r.vmid : Number(r.vmid),
      name: typeof r.name === "string" ? r.name : `vm-${r.vmid}`,
      node: typeof r.node === "string" ? r.node : "unknown",
      status: typeof r.status === "string" ? r.status : "unknown",
    }));
  return { ok: true, vms };
}

/** Starts one VM by id. The caller looks up which node it's currently on (via
 * listProxmoxVms) since this endpoint is scoped to a specific node. */
export async function startProxmoxVm(cfg: ProxmoxConfig, node: string, vmid: number): Promise<{ ok: boolean; error?: string }> {
  const result = await post(cfg, `/api2/json/nodes/${node}/qemu/${vmid}/status/start`);
  if (result.error) return { ok: false, error: result.error };
  return { ok: true };
}

/** Gracefully (ACPI) shuts down one VM by id -- the other half of a manual failover,
 * used to power down the primary site once DR is confirmed up. Same node lookup
 * caveat as startProxmoxVm. A VM without ACPI support (or a stuck guest OS) may not
 * respond to this -- Proxmox has a separate hard "stop" for that, not exposed here. */
export async function shutdownProxmoxVm(cfg: ProxmoxConfig, node: string, vmid: number): Promise<{ ok: boolean; error?: string }> {
  const result = await post(cfg, `/api2/json/nodes/${node}/qemu/${vmid}/status/shutdown`);
  if (result.error) return { ok: false, error: result.error };
  return { ok: true };
}
