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
  quorate: boolean | null;
  nodes: ProxmoxNode[];
  storages: ProxmoxStorageEntry[];
}

export interface StoragePayload {
  enabled: boolean;
  powerstore: PowerstoreStatus | null;
  proxmox: ProxmoxStatus | null;
}

const CRITICAL_SEVERITIES = new Set(["Critical", "Major"]);
const HEALTHY_METRO_STATES = new Set(["ok", "synchronized", "healthy"]);

export function isMetroSessionHealthy(state: string): boolean {
  return HEALTHY_METRO_STATES.has(state.toLowerCase());
}

export function isPowerstoreHealthy(status: PowerstoreStatus): boolean {
  if (!status.ok) return false;
  if (status.alerts.some((a) => CRITICAL_SEVERITIES.has(a.severity))) return false;
  if (status.metroSessions.some((m) => !isMetroSessionHealthy(m.state))) return false;
  return true;
}

export function isProxmoxHealthy(status: ProxmoxStatus): boolean {
  if (!status.ok) return false;
  if (status.quorate === false) return false;
  if (status.nodes.some((n) => !n.online)) return false;
  return status.storages.every((s) => s.active);
}

/** True unless storage monitoring is enabled and something it's watching (PowerStore
 * health/alerts/Metro, or Proxmox's view of that storage) is unhealthy -- so the site
 * banner can fold this in without needing to know it exists when it's off. */
export function isStorageHealthy(payload: StoragePayload | null): boolean {
  if (!payload?.enabled) return true;
  const powerstoreOk = !payload.powerstore || isPowerstoreHealthy(payload.powerstore);
  const proxmoxOk = !payload.proxmox || isProxmoxHealthy(payload.proxmox);
  return powerstoreOk && proxmoxOk;
}

export function Pill({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span
      className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-semibold ${
        ok ? "bg-emerald-50 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300" : "bg-red-50 dark:bg-red-500/20 text-red-700 dark:text-red-300"
      }`}
    >
      {label}
    </span>
  );
}

export function CapacityBar({ percent }: { percent: number }) {
  const clamped = Math.min(100, Math.max(0, percent));
  const barColor = clamped >= 90 ? "bg-red-500" : clamped >= 75 ? "bg-amber-500" : "bg-emerald-500";
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 rounded-full bg-slate-100 dark:bg-slate-700 overflow-hidden">
        <div className={`h-full ${barColor}`} style={{ width: `${clamped}%` }} />
      </div>
      <span className="text-xs text-slate-500 dark:text-slate-400 w-10 text-right">{clamped.toFixed(0)}%</span>
    </div>
  );
}

export function PowerstoreSection({
  status,
  canAcknowledge = false,
  acknowledgingId = null,
  onAcknowledge,
}: {
  status: PowerstoreStatus;
  canAcknowledge?: boolean;
  acknowledgingId?: string | null;
  onAcknowledge?: (alertId: string) => void;
}) {
  if (!status.ok) {
    return <p className="text-sm text-red-500">Unable to connect to PowerStore: {status.error ?? "unknown error"}</p>;
  }

  const hasCriticalAlert = status.alerts.some((a) => CRITICAL_SEVERITIES.has(a.severity));

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">
          {status.clusterName ?? "PowerStore"}
        </span>
        <Pill ok={!hasCriticalAlert} label={hasCriticalAlert ? "Attention" : "Healthy"} />
        {status.clusterState && <span className="text-xs text-slate-400">{status.clusterState}</span>}
      </div>

      <div>
        <p className="text-xs text-slate-400 mb-1">Active alerts ({status.alerts.length})</p>
        {status.alerts.length === 0 ? (
          <p className="text-sm text-slate-500 dark:text-slate-400">No active alerts</p>
        ) : (
          <ul className="space-y-1">
            {status.alerts.slice(0, 5).map((a, i) => (
              <li key={a.id || i} className="text-sm text-slate-600 dark:text-slate-300 flex items-start gap-2">
                <Pill ok={!CRITICAL_SEVERITIES.has(a.severity)} label={a.severity} />
                <span className="flex-1">{a.description}</span>
                {canAcknowledge && a.id && (
                  <button
                    type="button"
                    onClick={() => onAcknowledge?.(a.id)}
                    disabled={acknowledgingId === a.id}
                    className="text-xs font-medium text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 disabled:opacity-50 whitespace-nowrap"
                  >
                    {acknowledgingId === a.id ? "Clearing..." : "Clear"}
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div>
        <p className="text-xs text-slate-400 mb-1">Metro sync status</p>
        {status.metroSessions.length === 0 ? (
          <p className="text-sm text-slate-500 dark:text-slate-400">No Metro replication sessions found</p>
        ) : (
          <ul className="space-y-1">
            {status.metroSessions.map((m, i) => (
              <li key={i} className="text-sm text-slate-600 dark:text-slate-300 flex items-center gap-2">
                <Pill ok={isMetroSessionHealthy(m.state)} label={m.state} />
                <span>{m.name}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

export function ProxmoxSection({ status }: { status: ProxmoxStatus }) {
  if (!status.ok) {
    return <p className="text-sm text-red-500">Unable to connect to Proxmox: {status.error ?? "unknown error"}</p>;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">Cluster</span>
        {status.quorate !== null && <Pill ok={status.quorate} label={status.quorate ? "Quorate" : "No Quorum"} />}
      </div>

      {status.nodes.length > 0 && (
        <div>
          <p className="text-xs text-slate-400 mb-1">Nodes</p>
          <ul className="space-y-1.5">
            {status.nodes.map((n, i) => (
              <li key={i} className="flex flex-wrap items-center gap-3">
                <span className="text-sm font-medium text-slate-700 dark:text-slate-200 w-28 truncate">{n.name}</span>
                <Pill ok={n.online} label={n.online ? "Online" : "Offline"} />
                {n.cpuPercent !== undefined && (
                  <span className="text-xs text-slate-400">CPU {n.cpuPercent.toFixed(0)}%</span>
                )}
                {n.memPercent !== undefined && (
                  <div className="flex-1 min-w-[100px] max-w-[160px]">
                    <CapacityBar percent={n.memPercent} />
                  </div>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div>
        <p className="text-xs text-slate-400 mb-1">Storage</p>
        {status.storages.length === 0 ? (
          <p className="text-sm text-slate-500 dark:text-slate-400">No matching storage found on the Proxmox cluster.</p>
        ) : (
          <ul className="space-y-1.5">
            {status.storages.map((s, i) => (
              <li key={i} className="flex flex-wrap items-center gap-3">
                <span className="text-sm font-medium text-slate-700 dark:text-slate-200 w-28 truncate">{s.node}</span>
                <Pill ok={s.active} label={s.active ? "Available" : "Unavailable"} />
                {s.usedPercent !== undefined && (
                  <div className="flex-1 min-w-[120px]">
                    <CapacityBar percent={s.usedPercent} />
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
