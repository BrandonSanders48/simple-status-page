"use client";

import { useState } from "react";

interface CheckResult {
  name: string;
  port: number | null;
  /** null = inconclusive (see DHCP/RADIUS `detail` -- a silent non-reply from those
   * doesn't necessarily mean the service is down), not a confirmed pass or fail. */
  ok: boolean | null;
  detail?: string;
  ms: number;
}

const CHECK_NAMES = ["Ping (ICMP)", "DNS", "NTP", "Kerberos", "NPS / RADIUS", "DHCP", "LDAP", "SMB", "LDAPS", "Global Catalog", "Global Catalog (SSL)"];

/**
 * Ad-hoc network diagnostic modal -- runs a fixed battery of AD/DC-style checks
 * (ping, DNS, NTP, Kerberos, NPS/RADIUS, DHCP, LDAP/LDAPS, SMB, Global Catalog)
 * against a supplied host via /api/admin/test-network. Not tied to any configured
 * service; purely a troubleshooting tool for "why can't this box talk to my domain
 * controller".
 */
export default function TestNetworkModal({ csrfToken, onClose }: { csrfToken: string; onClose: () => void }) {
  const [host, setHost] = useState("");
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState<CheckResult[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function runTest() {
    if (!host.trim()) return;
    setRunning(true);
    setError(null);
    setResults(null);
    try {
      const res = await fetch("/api/admin/test-network", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-CSRF-Token": csrfToken },
        body: JSON.stringify({ host: host.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Test failed.");
      setResults(data.results);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Test failed.");
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-lg flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-slate-700/60 flex-shrink-0">
          <h5 className="font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <i className="fa-solid fa-network-wired text-indigo-500" /> Test Network
          </h5>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-600 text-2xl leading-none">
            &times;
          </button>
        </div>

        <div className="px-6 py-4 space-y-4">
          <div className="flex gap-2">
            <input
              type="text"
              value={host}
              onChange={(e) => setHost(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && runTest()}
              placeholder="Hostname or IP, e.g. dc01.corp.local"
              className="flex-1 text-sm rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700/60 px-3 py-2 text-slate-800 dark:text-slate-100"
            />
            <button
              type="button"
              onClick={runTest}
              disabled={running || !host.trim()}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg whitespace-nowrap disabled:opacity-60"
            >
              {running ? "Testing..." : "Run Test"}
            </button>
          </div>

          {error && <p className="text-sm text-red-500">{error}</p>}

          {(running || results) && (
            <ul className="space-y-2">
              {(results ?? []).map((r) => {
                const iconCls = r.ok === null ? "text-slate-400" : r.ok ? "text-emerald-500" : "text-red-500";
                const icon = r.ok === null ? "fa-circle-question" : r.ok ? "fa-circle-check" : "fa-circle-xmark";
                const statusText = r.ok === null ? "Inconclusive" : r.ok ? `OK, ${r.ms}ms` : "Failed";
                const statusCls = r.ok === null ? "text-slate-400" : r.ok ? "text-emerald-600 dark:text-emerald-400" : "text-red-500";
                return (
                  <li key={r.name} className="text-sm">
                    <div className="flex items-center gap-2">
                      <span className={`w-4 text-center ${iconCls}`}>
                        <i className={`fa-solid ${icon}`} />
                      </span>
                      <span className="flex-1 text-slate-700 dark:text-slate-200">
                        {r.name}
                        {r.port !== null && <span className="text-slate-400"> ({r.port})</span>}
                      </span>
                      <span className={`text-xs ${statusCls}`}>{statusText}</span>
                    </div>
                    {r.detail && <p className="pl-6 text-xs text-slate-400 dark:text-slate-500">{r.detail}</p>}
                  </li>
                );
              })}
              {running &&
                !results &&
                CHECK_NAMES.map((name) => (
                  <li key={name} className="flex items-center gap-2 text-sm">
                    <span className="w-4 text-center text-slate-300 dark:text-slate-600">
                      <i className="fa-solid fa-circle-notch fa-spin" />
                    </span>
                    <span className="flex-1 text-slate-400">{name}</span>
                  </li>
                ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
