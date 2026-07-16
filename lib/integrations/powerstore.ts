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
  /** Non-fatal notes about resources that couldn't be read (e.g. Metro not licensed,
   * or an unexpected response shape) -- surfaced in the admin Test Connection summary
   * so a schema mismatch is diagnosable without needing devtools access. */
  diagnostics: string[];
}

type JsonRecord = Record<string, unknown>;

const CRITICAL_SEVERITIES = new Set(["Critical", "Major"]);
const HEALTHY_METRO_STATES = new Set(["ok", "synchronized", "healthy"]);
const METRO_MARKER_KEYS = ["session_type", "replication_type", "type", "role"];

function authHeader(cfg: PowerstoreConfig): string {
  return "Basic " + Buffer.from(`${cfg.username}:${cfg.password}`).toString("base64");
}

/**
 * PowerStore's REST API only returns the `id` attribute unless a `select` query
 * parameter names the fields you want -- everything else comes back as if it doesn't
 * exist. Every call here must pass one.
 */
async function get(cfg: PowerstoreConfig, path: string, select: string, timeoutMs = 6000): Promise<unknown> {
  const sep = path.includes("?") ? "&" : "?";
  const res = await undiciFetch(`https://${cfg.host}/api/rest${path}${sep}select=${select}`, {
    headers: { Authorization: authHeader(cfg), Accept: "application/json" },
    dispatcher: insecureAgent,
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) {
    throw new Error(`${path} returned HTTP ${res.status}`);
  }
  return res.json();
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
    get(cfg, "/metro_replication_session", "id,name,state").catch((err) => {
      diagnostics.push(`metro_replication_session: ${err instanceof Error ? err.message : "failed"}`);
      return null;
    }),
    get(cfg, "/replication_session", "id,name,state,session_type,replication_type,role").catch((err) => {
      diagnostics.push(`replication_session: ${err instanceof Error ? err.message : "failed"}`);
      return null;
    }),
  ]);

  const dedicatedRows = asRecordArray(dedicated);
  const metroFromGeneral = asRecordArray(general).filter(looksLikeMetro);

  if (dedicatedRows.length === 0 && metroFromGeneral.length === 0 && dedicated === null && general === null) {
    diagnostics.push("Neither metro_replication_session nor replication_session was reachable.");
  }

  return [...dedicatedRows, ...metroFromGeneral];
}

/**
 * Queries the Dell PowerStore REST API (https://<mgmt-ip>/api/rest) for cluster
 * health, active alerts, and Metro replication session state.
 *
 * Field names below match the PowerStore REST API as documented for OS 3.x/4.x. Dell
 * has changed capacity field names across versions, so this reads several candidate
 * keys defensively rather than trusting one; if your array's response shapes differ,
 * check the live schema at https://<mgmt-ip>/swaggerui and adjust the reads here.
 */
export async function fetchPowerstoreStatus(cfg: PowerstoreConfig): Promise<PowerstoreStatus> {
  const diagnostics: string[] = [];
  try {
    const [clusterResult, alertResult, metroRows] = await Promise.all([
      get(cfg, "/cluster", "id,name,state,physical_total,physical_used,usable_total_capacity,usable_used_capacity"),
      get(cfg, "/alert", "id,severity,description_l10n,is_acknowledged"),
      fetchMetroSessions(cfg, diagnostics),
    ]);

    const clusters = asRecordArray(clusterResult);
    const cluster: JsonRecord | undefined = clusters[0] ?? (clusterResult as JsonRecord | undefined);
    const totalCapacity = firstNumber(cluster, ["physical_total", "usable_total_capacity"]);
    const usedCapacity = firstNumber(cluster, ["physical_used", "usable_used_capacity"]);

    const activeAlerts = asRecordArray(alertResult).filter((a) => a.is_acknowledged !== true);

    return {
      ok: true,
      clusterName: typeof cluster?.name === "string" ? cluster.name : undefined,
      clusterState: typeof cluster?.state === "string" ? cluster.state : undefined,
      usedCapacityPercent:
        totalCapacity && usedCapacity !== undefined && totalCapacity > 0
          ? (usedCapacity / totalCapacity) * 100
          : undefined,
      alerts: activeAlerts.map((a) => ({
        severity: typeof a.severity === "string" ? a.severity : "Unknown",
        description: typeof a.description_l10n === "string" ? a.description_l10n : "Unnamed alert",
      })),
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
