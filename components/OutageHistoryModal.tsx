"use client";

import { useEffect, useMemo, useState } from "react";
import { formatDuration, formatTimestamp } from "@/lib/format";

interface OutageRow {
  id: number;
  serviceName: string;
  wentDownAt: number;
  cameUpAt: number;
  durationS: number;
}

const TIME_OPTIONS = [
  { value: "", label: "All time" },
  { value: "1", label: "Last hour" },
  { value: "8", label: "Last 8 hours" },
  { value: "24", label: "Last 24 hours" },
  { value: "168", label: "Last 7 days" },
  { value: "720", label: "Last 30 days" },
];

export default function OutageHistoryModal({ onClose }: { onClose: () => void }) {
  const [rows, setRows] = useState<OutageRow[] | null>(null);
  const [service, setService] = useState("");
  const [hours, setHours] = useState("");

  useEffect(() => {
    fetch("/api/outages")
      .then((r) => r.json())
      .then(setRows)
      .catch(() => setRows([]));
  }, []);

  const services = useMemo(() => {
    const set = new Set<string>();
    (rows ?? []).forEach((r) => set.add(r.serviceName));
    return Array.from(set);
  }, [rows]);

  const filtered = useMemo(() => {
    if (!rows) return [];
    const cutoff = hours ? Math.floor(Date.now() / 1000) - Number(hours) * 3600 : 0;
    return rows.filter((r) => (!service || r.serviceName === service) && (!cutoff || r.wentDownAt >= cutoff));
  }, [rows, service, hours]);

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[80vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-slate-700/60 flex-shrink-0">
          <h5 className="font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <i className="fa-solid fa-clock-rotate-left text-indigo-500" /> Outage History
          </h5>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-600 text-2xl leading-none">
            &times;
          </button>
        </div>
        <div className="overflow-y-auto flex-1 px-6 py-4">
          {rows === null ? (
            <p className="text-sm text-slate-400 text-center py-6">Loading...</p>
          ) : rows.length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-6">No outages recorded yet.</p>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-2 mb-4">
                <select
                  aria-label="Filter by service"
                  value={service}
                  onChange={(e) => setService(e.target.value)}
                  className="text-xs border border-slate-200 dark:border-slate-600 rounded-lg px-2.5 py-1.5 bg-white dark:bg-slate-700/60"
                >
                  <option value="">All services</option>
                  {services.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
                <select
                  aria-label="Filter by time range"
                  value={hours}
                  onChange={(e) => setHours(e.target.value)}
                  className="text-xs border border-slate-200 dark:border-slate-600 rounded-lg px-2.5 py-1.5 bg-white dark:bg-slate-700/60"
                >
                  {TIME_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-700">
                    <th className="pb-2 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide pr-4">Service</th>
                    <th className="pb-2 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide pr-4">Went Down</th>
                    <th className="pb-2 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide pr-4">Recovered</th>
                    <th className="pb-2 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Duration</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((r) => (
                    <tr key={r.id} className="border-b border-slate-100 dark:border-slate-700/50 last:border-0">
                      <td className="py-2.5 pr-4 text-sm font-medium text-slate-800 dark:text-slate-200 whitespace-nowrap">{r.serviceName}</td>
                      <td className="py-2.5 pr-4 text-xs text-slate-500 dark:text-slate-400 whitespace-nowrap">{formatTimestamp(r.wentDownAt)}</td>
                      <td className="py-2.5 pr-4 text-xs text-slate-500 dark:text-slate-400 whitespace-nowrap">{formatTimestamp(r.cameUpAt)}</td>
                      <td className="py-2.5 text-xs font-mono text-slate-600 dark:text-slate-300 whitespace-nowrap">{formatDuration(r.durationS)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {filtered.length === 0 && (
                <p className="text-sm text-slate-400 dark:text-slate-500 text-center py-6">No outages match the selected filters.</p>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
