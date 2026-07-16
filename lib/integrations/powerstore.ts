import { fetch as undiciFetch } from "undici";
import { insecureAgent } from "@/lib/insecureAgent";

export interface PowerstoreConfig {
  host: string;
  username: string;
  password: string;
}

export interface PowerstoreAlert {
  id: string;
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
  alerts: PowerstoreAlert[];
  metroSessions: PowerstoreMetroSession[];
  /** Non-fatal notes about resources/fields that couldn't be read (e.g. a field name
   * PowerStore rejected, or an account lacking permission for Metro) -- surfaced in
   * the admin Test Connection summary so a schema mismatch is diagnosable without
   * devtools access. */
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

async function patch(cfg: PowerstoreConfig, path: string, body: JsonRecord, timeoutMs = 6000): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await undiciFetch(`https://${cfg.host}/api/rest${path}`, {
      method: "PATCH",
      headers: { Authorization: authHeader(cfg), Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify(body),
      dispatcher: insecureAgent,
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) {
      const respBody = await res.text().catch(() => "");
      return { ok: false, error: `${path} returned HTTP ${res.status}${respBody ? `: ${respBody.slice(0, 200)}` : ""}` };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? `${path}: ${err.message}` : `${path}: request failed` };
  }
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

/** Cluster identity/health (name, state) -- falls back to an unfiltered request
 * (guaranteed valid, if sparse) if the select itself is rejected. */
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
      id: typeof a.id === "string" ? a.id : "",
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
 * diagnostic rather than treated as fatal. A 403 on either specifically means the
 * configured PowerStore account's role doesn't have replication/Metro read
 * permission -- that's a PowerStore RBAC setting, not something fixable here.
 */
async function fetchMetroSessions(cfg: PowerstoreConfig, diagnostics: string[]): Promise<JsonRecord[]> {
  const [dedicated, general] = await Promise.all([
    get(cfg, "/metro_replication_session", "id,name,state"),
    get(cfg, "/replication_session", "id,state,session_type,replication_type,role"),
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
 * Dell has changed some of them across versions. Every resource is fetched
 * independently with its own fallback so one wrong field name only loses that one
 * piece of data instead of the entire status -- check `diagnostics` (surfaced in the
 * admin Test Connection summary) for anything that didn't come through, and
 * cross-reference https://<mgmt-ip>/swaggerui for the actual field names if needed.
 */
export async function fetchPowerstoreStatus(cfg: PowerstoreConfig): Promise<PowerstoreStatus> {
  const diagnostics: string[] = [];
  try {
    const [cluster, alerts, metroRows] = await Promise.all([
      fetchClusterIdentity(cfg, diagnostics),
      fetchAlerts(cfg, diagnostics),
      fetchMetroSessions(cfg, diagnostics),
    ]);

    return {
      ok: true,
      clusterName: typeof cluster?.name === "string" ? cluster.name : undefined,
      clusterState: typeof cluster?.state === "string" ? cluster.state : undefined,
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

/** Acknowledges (clears) a PowerStore alert so it drops off the active-alerts list. */
export async function acknowledgePowerstoreAlert(cfg: PowerstoreConfig, alertId: string): Promise<{ ok: boolean; error?: string }> {
  return patch(cfg, `/alert/${encodeURIComponent(alertId)}`, { is_acknowledged: true });
}
