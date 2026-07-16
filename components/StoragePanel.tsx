"use client";

import { useEffect, useState } from "react";

interface PowerstoreAlert {
  severity: string;
  description: string;
}

interface PowerstoreMetroSession {
  name: string;
  state: string;
}

interface PowerstoreStatus {
  ok: boolean;
  error?: string;
  clusterName?: string;
  clusterState?: string;
  usedCapacityPercent?: number;
  alerts: PowerstoreAlert[];
  metroSessions: PowerstoreMetroSession[];
}

interface ProxmoxStorageEntry {
  node: string;
  storage: string;
  active: boolean;
  usedPercent?: number;
}

interface ProxmoxStatus {
  ok: boolean;
  error?: string;
  storages: ProxmoxStorageEntry[];
}

interface StoragePayload {
  enabled: boolean;
  powerstore: PowerstoreStatus | null;
  proxmox: ProxmoxStatus | null;
}

const CRITICAL_SEVERITIES = new Set(["Critical", "Major"]);
const HEALTHY_METRO_STATES = new Set(["ok", "synchronized", "healthy"]);

function Pill({ ok, label }: { ok: boolean; label: string }) {
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

function CapacityBar({ percent }: { percent: number }) {
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

function PowerstoreSection({ status }: { status: PowerstoreStatus }) {
  if (!status.ok) {
    return <p className="text-sm text-red-500">PowerStore: {status.error ?? "unable to connect"}</p>;
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

      {status.usedCapacityPercent !== undefined && (
        <div>
          <p className="text-xs text-slate-400 mb-1">Capacity used</p>
          <CapacityBar percent={status.usedCapacityPercent} />
        </div>
      )}

      <div>
        <p className="text-xs text-slate-400 mb-1">Active alerts ({status.alerts.length})</p>
        {status.alerts.length === 0 ? (
          <p className="text-sm text-slate-500 dark:text-slate-400">No active alerts</p>
        ) : (
          <ul className="space-y-1">
            {status.alerts.slice(0, 5).map((a, i) => (
              <li key={i} className="text-sm text-slate-600 dark:text-slate-300 flex items-start gap-2">
                <Pill ok={!CRITICAL_SEVERITIES.has(a.severity)} label={a.severity} />
                <span className="flex-1">{a.description}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {status.metroSessions.length > 0 && (
        <div>
          <p className="text-xs text-slate-400 mb-1">Metro replication</p>
          <ul className="space-y-1">
            {status.metroSessions.map((m, i) => (
              <li key={i} className="text-sm text-slate-600 dark:text-slate-300 flex items-center gap-2">
                <Pill ok={HEALTHY_METRO_STATES.has(m.state.toLowerCase())} label={m.state} />
                <span>{m.name}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function ProxmoxSection({ status }: { status: ProxmoxStatus }) {
  if (!status.ok) {
    return <p className="text-sm text-red-500">Proxmox: {status.error ?? "unable to connect"}</p>;
  }
  if (status.storages.length === 0) {
    return <p className="text-sm text-slate-500 dark:text-slate-400">No matching storage found on the Proxmox cluster.</p>;
  }

  return (
    <ul className="space-y-2">
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
  );
}

export default function StoragePanel() {
  const [data, setData] = useState<StoragePayload | null>(null);

  useEffect(() => {
    const load = () => fetch("/api/storage").then((r) => r.json()).then(setData).catch(() => {});
    load();
    const timer = setInterval(load, 60_000);
    return () => clearInterval(timer);
  }, []);

  if (!data?.enabled || (!data.powerstore && !data.proxmox)) return null;

  return (
    <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-sm p-5 mb-5">
      <h5 className="flex items-center gap-2 text-base font-semibold text-slate-800 dark:text-slate-200 mb-4">
        <i className="fa-solid fa-database text-cyan-500" /> Storage
      </h5>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {data.powerstore && (
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-2">PowerStore</p>
            <PowerstoreSection status={data.powerstore} />
          </div>
        )}
        {data.proxmox && (
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-2">Proxmox Cluster</p>
            <ProxmoxSection status={data.proxmox} />
          </div>
        )}
      </div>
    </div>
  );
}
