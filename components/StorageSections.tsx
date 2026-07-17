export interface PowerstoreAlert {
  id: string;
  severity: string;
  description: string;
  raisedAt?: string;
}

export interface PowerstoreMetroSession {
  id: string;
  name: string;
  state: string;
  role?: string;
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

export interface PowerstoreTarget {
  id: number;
  name: string;
  isDr: boolean;
  status: PowerstoreStatus;
}

export interface ProxmoxTarget {
  id: number;
  name: string;
  isDr: boolean;
  status: ProxmoxStatus;
}

export interface StoragePayload {
  enabled: boolean;
  powerstores: PowerstoreTarget[];
  proxmoxes: ProxmoxTarget[];
}

export interface PbsTask {
  id: string;
  status: string;
  startedAt?: string;
  endedAt?: string;
  acknowledged: boolean;
}

export interface PbsStatus {
  ok: boolean;
  error?: string;
  lastRunHealthy: boolean;
  lastRunAt?: string;
  tasks: PbsTask[];
}

export interface PbsTarget {
  id: number;
  name: string;
  status: PbsStatus;
}

export interface PbsPayload {
  enabled: boolean;
  targets: PbsTarget[];
}

const CRITICAL_SEVERITIES = new Set(["critical", "major"]);
const HEALTHY_METRO_STATES = new Set(["ok", "synchronized", "healthy"]);

function formatAlertTime(raisedAt: string): string {
  const d = new Date(raisedAt);
  if (isNaN(d.getTime())) return raisedAt;
  return d.toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

/** Info/Minor/Warning alerts are noise, not issues -- only Critical/Major should ever
 * flip a tab badge, the "Attention" pill, or the overall status banner to unhealthy. */
export function isCriticalSeverity(severity: string): boolean {
  return CRITICAL_SEVERITIES.has(severity.toLowerCase());
}

export function isMetroSessionHealthy(state: string): boolean {
  return HEALTHY_METRO_STATES.has(state.toLowerCase());
}

export function isPowerstoreHealthy(status: PowerstoreStatus): boolean {
  if (!status.ok) return false;
  if (status.alerts.some((a) => isCriticalSeverity(a.severity))) return false;
  if (status.metroSessions.some((m) => !isMetroSessionHealthy(m.state))) return false;
  return true;
}

export function isProxmoxHealthy(status: ProxmoxStatus): boolean {
  if (!status.ok) return false;
  if (status.quorate === false) return false;
  if (status.nodes.some((n) => !n.online)) return false;
  return status.storages.every((s) => s.active);
}

/** True unless storage monitoring is enabled and something it's watching (any
 * PowerStore's health/alerts/Metro, or any Proxmox cluster's view of its storage) is
 * unhealthy -- so the site banner can fold this in without needing to know it exists
 * when it's off. */
export function isStorageHealthy(payload: StoragePayload | null): boolean {
  if (!payload?.enabled) return true;
  return payload.powerstores.every((t) => isPowerstoreHealthy(t.status)) && payload.proxmoxes.every((t) => isProxmoxHealthy(t.status));
}

export function isPbsHealthy(status: PbsStatus): boolean {
  return status.ok && status.lastRunHealthy;
}

/** True unless backup monitoring is enabled and the most recent run on some PBS
 * target had failures -- same "invisible when off" fold-in as isStorageHealthy. */
export function isPbsAllHealthy(payload: PbsPayload | null): boolean {
  if (!payload?.enabled) return true;
  return payload.targets.every((t) => isPbsHealthy(t.status));
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

function DrBadge() {
  return (
    <span className="inline-block px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-50 dark:bg-amber-500/20 text-amber-700 dark:text-amber-300">
      DR Site
    </span>
  );
}

export function PowerstoreSection({
  name,
  status,
  isDr = false,
  canAcknowledge = false,
  acknowledgingId = null,
  onAcknowledge,
}: {
  name: string;
  status: PowerstoreStatus;
  isDr?: boolean;
  canAcknowledge?: boolean;
  acknowledgingId?: string | null;
  onAcknowledge?: (alertId: string) => void;
}) {
  if (!status.ok) {
    return (
      <div>
        <p className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-1">{name}</p>
        <p className="text-sm text-red-500">Unable to connect to PowerStore: {status.error ?? "unknown error"}</p>
      </div>
    );
  }

  const hasCriticalAlert = status.alerts.some((a) => isCriticalSeverity(a.severity));

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">{name}</span>
        <Pill ok={!hasCriticalAlert} label={hasCriticalAlert ? "Attention" : "Healthy"} />
        {isDr && <DrBadge />}
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
                <Pill ok={!isCriticalSeverity(a.severity)} label={a.severity} />
                <span className="flex-1">
                  {a.description}
                  {a.raisedAt && <span className="block text-xs text-slate-400 dark:text-slate-500">{formatAlertTime(a.raisedAt)}</span>}
                </span>
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

export function ProxmoxSection({ name, status, isDr = false }: { name: string; status: ProxmoxStatus; isDr?: boolean }) {
  if (!status.ok) {
    return (
      <div>
        <p className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-1">{name}</p>
        <p className="text-sm text-red-500">Unable to connect to Proxmox: {status.error ?? "unknown error"}</p>
      </div>
    );
  }

  // Storage is typically shared across every node in the cluster, so each node's row
  // shows its own compute (CPU/memory) alongside that shared storage's status/capacity
  // rather than as a disconnected second list.
  const storageByNode = new Map(status.storages.map((s) => [s.node, s]));
  const unmatchedStorages = status.storages.filter((s) => !status.nodes.some((n) => n.name === s.node));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">{name}</span>
        {status.quorate !== null && <Pill ok={status.quorate} label={status.quorate ? "Quorate" : "No Quorum"} />}
        {isDr && <DrBadge />}
      </div>

      {status.nodes.length > 0 ? (
        <div>
          <p className="text-xs text-slate-400 mb-1">Nodes</p>
          <ul className="space-y-2">
            {status.nodes.map((n, i) => {
              const storage = storageByNode.get(n.name);
              return (
                <li key={i} className="flex flex-wrap items-center gap-3">
                  <span className="text-sm font-medium text-slate-700 dark:text-slate-200 w-28 truncate">{n.name}</span>
                  <Pill ok={n.online} label={n.online ? "Online" : "Offline"} />
                  {n.cpuPercent !== undefined && <span className="text-xs text-slate-400">CPU {n.cpuPercent.toFixed(0)}%</span>}
                  {n.memPercent !== undefined && (
                    <div className="w-24 flex-shrink-0">
                      <CapacityBar percent={n.memPercent} />
                    </div>
                  )}
                  {storage && (
                    <>
                      <Pill ok={storage.active} label={storage.active ? "Storage Available" : "Storage Unavailable"} />
                      {storage.usedPercent !== undefined && (
                        <div className="flex-1 min-w-[100px]">
                          <CapacityBar percent={storage.usedPercent} />
                        </div>
                      )}
                    </>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      ) : (
        status.storages.length === 0 && (
          <p className="text-sm text-slate-500 dark:text-slate-400">No matching storage found on the Proxmox cluster.</p>
        )
      )}

      {unmatchedStorages.length > 0 && (
        <div>
          <p className="text-xs text-slate-400 mb-1">Storage</p>
          <ul className="space-y-1.5">
            {unmatchedStorages.map((s, i) => (
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
        </div>
      )}
    </div>
  );
}

function formatTaskTime(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

export function PbsSection({
  name,
  status,
  canAcknowledge = false,
  acknowledgingId = null,
  onAcknowledge,
}: {
  name: string;
  status: PbsStatus;
  canAcknowledge?: boolean;
  acknowledgingId?: string | null;
  onAcknowledge?: (taskId: string) => void;
}) {
  if (!status.ok) {
    return (
      <div>
        <p className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-1">{name}</p>
        <p className="text-sm text-red-500">Unable to connect to Proxmox Backup Server: {status.error ?? "unknown error"}</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">{name}</span>
        <Pill ok={status.lastRunHealthy} label={status.lastRunHealthy ? "Last Run OK" : "Last Run Failed"} />
        {status.lastRunAt && <span className="text-xs text-slate-400">{formatTaskTime(status.lastRunAt)}</span>}
      </div>

      <div>
        <p className="text-xs text-slate-400 mb-1">Last backup run ({status.tasks.length} task(s))</p>
        {status.tasks.length === 0 ? (
          <p className="text-sm text-slate-500 dark:text-slate-400">No backup tasks found</p>
        ) : (
          <ul className="space-y-1">
            {status.tasks.slice(0, 10).map((t, i) => {
              const needsClearing = t.status !== "OK" && !t.acknowledged;
              return (
                <li key={i} className={`text-sm flex items-center gap-2 ${t.acknowledged ? "opacity-50" : "text-slate-600 dark:text-slate-300"}`}>
                  <Pill ok={t.status === "OK"} label={t.acknowledged ? `${t.status} (cleared)` : t.status} />
                  <span className="flex-1">{t.id}</span>
                  {t.endedAt && <span className="text-xs text-slate-400">{formatTaskTime(t.endedAt)}</span>}
                  {canAcknowledge && needsClearing && (
                    <button
                      type="button"
                      onClick={() => onAcknowledge?.(t.id)}
                      disabled={acknowledgingId === t.id}
                      className="text-xs font-medium text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 disabled:opacity-50 whitespace-nowrap"
                    >
                      {acknowledgingId === t.id ? "Clearing..." : "Clear"}
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
