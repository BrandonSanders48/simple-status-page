import { fetch as undiciFetch } from "undici";
import { insecureAgent } from "@/lib/insecureAgent";

export interface PowerstoreConfig {
  host: string;
  username: string;
  password: string;
}

export interface PowerstoreAlert {
  severity: string;
  description: string;
}

export interface PowerstoreMetroSession {
  name: string;
  state: string;
}

export interface PowerstoreStatus {
  ok: boolean;
  error?: string;
  clusterName?: string;
  clusterState?: string;
  /** Used-capacity percentage, when the array reports it. Absolute figures aren't
   * surfaced because the capacity field's unit varies across PowerStore API versions
   * and getting it wrong would show a wildly incorrect number; a percentage is
   * unit-invariant. */
  usedCapacityPercent?: number;
  alerts: PowerstoreAlert[];
  metroSessions: PowerstoreMetroSession[];
  /** Non-fatal notes about resources/fields that couldn't be read (e.g. a field name
   * PowerStore rejected, or Metro not licensed) -- surfaced in the admin Test
   * Connection summary so a schema mismatch is diagnosable without devtools access. */
  diagnostics: string[];
}

type JsonRecord = Record<string, unknown>;
type GetResult = { data: unknown; error: null } | { data: null; error: string };

const CRITICAL_SEVERITIES = new Set(["Critical", "Major"]);
const HEALTHY_METRO_STATES = new Set(["ok", "synchronized", "healthy"]);
const METRO_MARKER_KEYS = ["session_type", "replication_type", "type", "role"];

function authHeader(cfg: PowerstoreConfig): string {
  return "Basic " + Buffer.from(`${cfg.username}:${cfg.password}`).toString("base64");
}

/**
 * PowerStore's REST API only returns the `id` attribute unless a `select` query
 * parameter names the fields you want. Crucially, naming even one field it doesn't
 * recognize fails the *entire* request with HTTP 400 -- so every call here is
 * try/caught individually (never combined in a single Promise.all without a catch)
 * and callers fall back to a smaller/no select on failure, rather than letting one bad
 * guess at a field name take down the whole status fetch.
 */
async function get(cfg: PowerstoreConfig, path: string, select: string | null, timeoutMs = 6000): Promise<GetResult> {
  try {
    const sep = path.includes("?") ? "&" : "?";
    const url = `https://${cfg.host}/api/rest${path}${select ? `${sep}select=${select}` : ""}`;
    const res = await undiciFetch(url, {
      headers: { Authorization: authHeader(cfg), Accept: "application/json" },
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

function firstNumber(obj: JsonRecord | undefined, keys: string[]): number | undefined {
  for (const key of keys) {
    const v = obj?.[key];
    if (typeof v === "number") return v;
  }
  return undefined;
}

function asRecordArray(value: unknown): JsonRecord[] {
  return Array.isArray(value) ? (value as JsonRecord[]) : [];
}

function looksLikeMetro(entry: JsonRecord): boolean {
  return METRO_MARKER_KEYS.some((key) => typeof entry[key] === "string" && (entry[key] as string).toLowerCase().includes("metro"));
}

export function isPowerstoreAlertCritical(severity: string): boolean {
  return CRITICAL_SEVERITIES.has(severity);
}

export function isMetroSessionHealthy(state: string): boolean {
  return HEALTHY_METRO_STATES.has(state.toLowerCase());
}

/** Cluster identity/health (name, state) -- isolated from the capacity fetch below so a
 * bad capacity field name can never take out name/state too. Falls back to an
 * unfiltered request (guaranteed valid, if sparse) if the select itself is rejected. */
async function fetchClusterIdentity(cfg: PowerstoreConfig, diagnostics: string[]): Promise<JsonRecord | undefined> {
  const attempt = await get(cfg, "/cluster", "id,name,state");
  if (!attempt.error) return asRecordArray(attempt.data)[0];

  diagnostics.push(attempt.error);
  const fallback = await get(cfg, "/cluster", null);
  if (fallback.error) {
    diagnostics.push(fallback.error);
    return undefined;
  }
  return asRecordArray(fallback.data)[0];
}

/** Best-effort capacity read -- field names vary across PowerStore OS versions, so a
 * 400 here is expected on some arrays and just means no capacity bar is shown. */
async function fetchClusterCapacity(cfg: PowerstoreConfig, diagnostics: string[]): Promise<{ total?: number; used?: number }> {
  const attempt = await get(cfg, "/cluster", "id,physical_total,physical_used,usable_total_capacity,usable_used_capacity");
  if (attempt.error) {
    diagnostics.push(attempt.error);
    return {};
  }
  const cluster = asRecordArray(attempt.data)[0];
  return {
    total: firstNumber(cluster, ["physical_total", "usable_total_capacity"]),
    used: firstNumber(cluster, ["physical_used", "usable_used_capacity"]),
  };
}

async function fetchAlerts(cfg: PowerstoreConfig, diagnostics: string[]): Promise<PowerstoreAlert[]> {
  const attempt = await get(cfg, "/alert", "id,severity,description_l10n,is_acknowledged");
  let rows: JsonRecord[];
  if (!attempt.error) {
    rows = asRecordArray(attempt.data);
  } else {
    diagnostics.push(attempt.error);
    const fallback = await get(cfg, "/alert", "id,severity,is_acknowledged");
    if (fallback.error) {
      diagnostics.push(fallback.error);
      return [];
    }
    rows = asRecordArray(fallback.data);
  }

  return rows
    .filter((a) => a.is_acknowledged !== true)
    .map((a) => ({
      severity: typeof a.severity === "string" ? a.severity : "Unknown",
      description: typeof a.description_l10n === "string" ? a.description_l10n : "Unnamed alert",
    }));
}

/**
 * Fetches Metro replication sessions. Dell has exposed this under different resource
 * names/shapes across PowerStore OS versions -- the dedicated `metro_replication_session`
 * resource on newer arrays, or entries within the general `replication_session`
 * resource on older ones (distinguished by a type/role field mentioning "metro"). Both
 * are tried; whichever responds wins, and a failure on either is recorded as a
 * diagnostic rather than treated as fatal.
 */
async function fetchMetroSessions(cfg: PowerstoreConfig, diagnostics: string[]): Promise<JsonRecord[]> {
  const [dedicated, general] = await Promise.all([
    get(cfg, "/metro_replication_session", "id,name,state"),
    get(cfg, "/replication_session", "id,name,state,session_type,replication_type,role"),
  ]);

  if (dedicated.error) diagnostics.push(dedicated.error);
  if (general.error) diagnostics.push(general.error);

  const dedicatedRows = asRecordArray(dedicated.data);
  const metroFromGeneral = asRecordArray(general.data).filter(looksLikeMetro);

  return [...dedicatedRows, ...metroFromGeneral];
}

/**
 * Queries the Dell PowerStore REST API (https://<mgmt-ip>/api/rest) for cluster
 * health, active alerts, and Metro replication session state.
 *
 * Field names below match the PowerStore REST API as documented for OS 3.x/4.x, but
 * Dell has changed some of them (especially capacity) across versions. Every resource
 * is fetched independently with its own fallback so one wrong field name only loses
 * that one piece of data instead of the entire status -- check `diagnostics` (surfaced
 * in the admin Test Connection summary) for anything that didn't come through, and
 * cross-reference https://<mgmt-ip>/swaggerui for the actual field names if needed.
 */
export async function fetchPowerstoreStatus(cfg: PowerstoreConfig): Promise<PowerstoreStatus> {
  const diagnostics: string[] = [];
  try {
    const [cluster, capacity, alerts, metroRows] = await Promise.all([
      fetchClusterIdentity(cfg, diagnostics),
      fetchClusterCapacity(cfg, diagnostics),
      fetchAlerts(cfg, diagnostics),
      fetchMetroSessions(cfg, diagnostics),
    ]);

    return {
      ok: true,
      clusterName: typeof cluster?.name === "string" ? cluster.name : undefined,
      clusterState: typeof cluster?.state === "string" ? cluster.state : undefined,
      usedCapacityPercent:
        capacity.total && capacity.used !== undefined && capacity.total > 0 ? (capacity.used / capacity.total) * 100 : undefined,
      alerts,
      metroSessions: metroRows.map((m) => ({
        name: (typeof m.name === "string" && m.name) || (typeof m.id === "string" && m.id) || "Metro session",
        state: typeof m.state === "string" ? m.state : "Unknown",
      })),
      diagnostics,
    };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Failed to query PowerStore",
      alerts: [],
      metroSessions: [],
      diagnostics,
    };
  }
}
