import { fetch as undiciFetch } from "undici";
import { insecureAgent } from "@/lib/insecureAgent";

export interface PbsConfig {
  host: string;
  tokenId: string;
  tokenSecret: string;
}

export interface PbsTask {
  id: string;
  status: string;
  startedAt?: string;
  endedAt?: string;
  /** Always false here - this integration layer has no db access. The caller (see
   * lib/pbsCache.ts) overlays acknowledgment state and recomputes lastRunHealthy. */
  acknowledged: boolean;
}

export interface PbsStatus {
  ok: boolean;
  error?: string;
  /** True if every task in the most recent backup run completed with status "OK". */
  lastRunHealthy: boolean;
  lastRunAt?: string;
  tasks: PbsTask[];
  diagnostics: string[];
}

type JsonRecord = Record<string, unknown>;
type GetResult = { data: unknown; error: null } | { data: null; error: string };

// A single scheduled backup run typically backs up several guests as separate tasks
// that all start within moments of each other - grouping by this window is how we
// treat them as "the last backup" rather than just the single most recent task.
const RUN_GROUP_WINDOW_S = 3 * 60 * 60;

function baseUrl(host: string): string {
  const trimmed = host.trim().replace(/\/$/, "");
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

async function get(cfg: PbsConfig, path: string, timeoutMs = 8000): Promise<GetResult> {
  try {
    const res = await undiciFetch(`${baseUrl(cfg.host)}${path}`, {
      // PBS shares Proxmox VE's task/node API shapes, but NOT its auth header - PBS
      // uses its own "PBSAPIToken" scheme with a `:` before the secret (PVE uses
      // "PVEAPIToken" with `=`). Mixing these up authenticates as nobody -> 401.
      headers: { Authorization: `PBSAPIToken=${cfg.tokenId}:${cfg.tokenSecret}` },
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

function asRecordArray(value: unknown): JsonRecord[] {
  const body = value as { data?: unknown };
  return Array.isArray(body?.data) ? (body.data as JsonRecord[]) : [];
}

/**
 * Proxmox Backup Server doesn't cluster the way Proxmox VE does - a standalone
 * instance conventionally reports itself as node "localhost". Confirmed via /nodes
 * where possible, falling back to that convention otherwise.
 */
async function fetchNodeName(cfg: PbsConfig, diagnostics: string[]): Promise<string> {
  const result = await get(cfg, "/api2/json/nodes");
  if (result.error) {
    diagnostics.push(result.error);
    return "localhost";
  }
  const first = asRecordArray(result.data)[0];
  return first && typeof first.node === "string" ? first.node : "localhost";
}

/**
 * Queries the Proxmox Backup Server task log for recent backup jobs and checks
 * whether the most recent backup run completed without errors.
 *
 * Field names mirror Proxmox VE's task API, which PBS shares the same framework with
 * (unlike PowerStore's REST API, Proxmox APIs return full objects by default - no
 * `select` param needed). This hasn't been verified against a live PBS instance yet,
 * though, so check the admin Test Connection summary and adjust field names here if
 * something looks wrong.
 */
export async function fetchPbsStatus(cfg: PbsConfig): Promise<PbsStatus> {
  const diagnostics: string[] = [];
  try {
    const node = await fetchNodeName(cfg, diagnostics);
    const result = await get(cfg, `/api2/json/nodes/${encodeURIComponent(node)}/tasks?typefilter=backup&limit=50`);
    if (result.error) {
      return { ok: false, error: result.error, lastRunHealthy: false, tasks: [], diagnostics };
    }

    const rows = asRecordArray(result.data)
      .filter((t) => typeof t.starttime === "number")
      .sort((a, b) => (b.starttime as number) - (a.starttime as number));

    if (rows.length === 0) {
      return { ok: true, lastRunHealthy: true, tasks: [], diagnostics };
    }

    const latestStart = rows[0]!.starttime as number;
    const lastRun = rows.filter((t) => latestStart - (t.starttime as number) <= RUN_GROUP_WINDOW_S);

    const tasks: PbsTask[] = lastRun.map((t) => ({
      id: (typeof t.id === "string" && t.id) || (typeof t.worker_id === "string" && t.worker_id) || "backup",
      status: typeof t.status === "string" ? t.status : "running",
      startedAt: typeof t.starttime === "number" ? new Date(t.starttime * 1000).toISOString() : undefined,
      endedAt: typeof t.endtime === "number" ? new Date(t.endtime * 1000).toISOString() : undefined,
      acknowledged: false,
    }));

    return {
      ok: true,
      lastRunHealthy: tasks.every((t) => t.status === "OK"),
      lastRunAt: tasks[0]?.startedAt,
      tasks,
      diagnostics,
    };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Failed to query Proxmox Backup Server",
      lastRunHealthy: false,
      tasks: [],
      diagnostics,
    };
  }
}
