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
}

type JsonRecord = Record<string, unknown>;

const CRITICAL_SEVERITIES = new Set(["Critical", "Major"]);
const HEALTHY_METRO_STATES = new Set(["ok", "synchronized", "healthy"]);

function authHeader(cfg: PowerstoreConfig): string {
  return "Basic " + Buffer.from(`${cfg.username}:${cfg.password}`).toString("base64");
}

async function get(cfg: PowerstoreConfig, path: string, timeoutMs = 6000): Promise<unknown> {
  const res = await undiciFetch(`https://${cfg.host}/api/rest${path}`, {
    headers: { Authorization: authHeader(cfg), Accept: "application/json" },
    dispatcher: insecureAgent,
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) {
    throw new Error(`PowerStore API ${path} returned HTTP ${res.status}`);
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

export function isPowerstoreAlertCritical(severity: string): boolean {
  return CRITICAL_SEVERITIES.has(severity);
}

export function isMetroSessionHealthy(state: string): boolean {
  return HEALTHY_METRO_STATES.has(state.toLowerCase());
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
  try {
    const [clusterResult, alertResult, metroResult] = await Promise.all([
      get(cfg, "/cluster"),
      get(cfg, "/alert"),
      // Metro Volume isn't licensed/configured on every array -- treat a failure here
      // as "no sessions" rather than failing the whole status fetch.
      get(cfg, "/metro_replication_session").catch(() => []),
    ]);

    const clusters = asRecordArray(clusterResult);
    const cluster: JsonRecord | undefined = clusters[0] ?? (clusterResult as JsonRecord | undefined);
    const totalCapacity = firstNumber(cluster, ["physical_total", "usable_total_capacity", "physical_mb"]);
    const usedCapacity = firstNumber(cluster, ["physical_used", "usable_used_capacity"]);

    const activeAlerts = asRecordArray(alertResult).filter(
      (a) => a.is_acknowledged !== true && a.state !== "Resolved"
    );

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
        description:
          (typeof a.description_l10n === "string" && a.description_l10n) ||
          (typeof a.description === "string" && a.description) ||
          "Unnamed alert",
      })),
      metroSessions: asRecordArray(metroResult).map((m) => ({
        name: (typeof m.name === "string" && m.name) || (typeof m.id === "string" && m.id) || "Metro session",
        state: typeof m.state === "string" ? m.state : "Unknown",
      })),
    };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Failed to query PowerStore",
      alerts: [],
      metroSessions: [],
    };
  }
}
