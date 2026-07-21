"use client";

import { useEffect, useRef, useState } from "react";

interface CheckResult {
  name: string;
  port: number | null;
  /** null = inconclusive (see RADIUS's `detail` - a silent non-reply doesn't
   * necessarily mean the service is down), not a confirmed pass or fail. */
  ok: boolean | null;
  detail?: string;
  ms: number;
}

interface ResultGroup {
  label: string;
  host: string;
  results: CheckResult[];
}

const CHECK_NAMES = ["Ping (ICMP)", "DNS", "NTP", "Kerberos", "NPS / RADIUS", "LDAP", "SMB", "LDAPS", "Global Catalog", "Global Catalog (SSL)"];

function CheckResultsList({ results }: { results: CheckResult[] }) {
  return (
    <ul className="space-y-2">
      {results.map((r) => {
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
    </ul>
  );
}

function PendingList() {
  return (
    <ul className="space-y-2">
      {CHECK_NAMES.map((name) => (
        <li key={name} className="flex items-center gap-2 text-sm">
          <span className="w-4 text-center text-slate-300 dark:text-slate-600">
            <i className="fa-solid fa-circle-notch fa-spin" />
          </span>
          <span className="flex-1 text-slate-400">{name}</span>
        </li>
      ))}
    </ul>
  );
}

interface SpeedTestState {
  running: boolean;
  downloadMbps: number | null;
  uploadMbps: number | null;
  error: string | null;
}

const SPEED_PENDING: SpeedTestState = { running: true, downloadMbps: null, uploadMbps: null, error: null };

/**
 * Network diagnostic modal - runs a fixed battery of AD/DC-style checks (ping,
 * DNS, NTP, Kerberos, NPS/RADIUS, LDAP/LDAPS, SMB, Global Catalog) against every
 * domain controller configured under Services (type "ad") plus this site's
 * configured WAN targets (Settings > Network's Gateway Host and Public DNS Host),
 * plus a WAN download/upload speed test - all automatically, as soon as it opens,
 * running in parallel rather than gating one on the other.
 *
 * Deliberately has no free-form host field - letting a visitor test an arbitrary
 * host/port was a real SSRF/scanning-proxy surface (see the API route), so the
 * target list is exactly what's already configured elsewhere, nothing else.
 */
export default function TestNetworkModal({ csrfToken, onClose }: { csrfToken: string; onClose: () => void }) {
  const [groups, setGroups] = useState<ResultGroup[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [speed, setSpeed] = useState<SpeedTestState>(SPEED_PENDING);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch("/api/admin/test-network", { method: "POST", headers: { "Content-Type": "application/json", "X-CSRF-Token": csrfToken }, body: "{}" })
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Test failed.");
        setGroups(data.groups);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Test failed."));

    fetch("/api/admin/test-speed", { method: "POST", headers: { "X-CSRF-Token": csrfToken } })
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Speed test failed.");
        setSpeed({ running: false, downloadMbps: data.downloadMbps, uploadMbps: data.uploadMbps, error: data.error ?? null });
      })
      .catch((err) => setSpeed({ running: false, downloadMbps: null, uploadMbps: null, error: err instanceof Error ? err.message : "Speed test failed." }));
    // Both run once per modal open, in parallel.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Scroll down to reveal the results (and the pass/fail rating below them) once
  // the test finishes - while "Testing..." the content is short and needs no
  // scrolling, but the full results list often doesn't fit the modal's max height.
  useEffect(() => {
    if (groups === null) return;
    const el = scrollRef.current;
    if (!el) return;
    requestAnimationFrame(() => el.scrollTo({ top: el.scrollHeight, behavior: "smooth" }));
  }, [groups]);

  const allResults = groups?.flatMap((g) => g.results) ?? [];
  const failCount = allResults.filter((r) => r.ok === false).length;
  const overallPass = groups !== null && groups.length > 0 && failCount === 0;

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-lg max-h-[85vh] flex flex-col"
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

        <div ref={scrollRef} className="px-6 py-4 space-y-5 overflow-y-auto">
          {error && <p className="text-sm text-red-500">{error}</p>}

          {!error && groups === null && (
            <div className="space-y-2">
              <p className="text-sm font-medium text-slate-700 dark:text-slate-200">Testing...</p>
              <PendingList />
            </div>
          )}

          {groups !== null && groups.length === 0 && (
            <p className="text-sm text-slate-400 dark:text-slate-500">
              Nothing configured to test - add a Service with type &quot;ad&quot;, or set a Gateway Host / Public DNS Host under Settings &gt;
              Network.
            </p>
          )}

          {groups?.map((g) => (
            <div key={g.host} className="space-y-2">
              <p className="text-sm font-medium text-slate-700 dark:text-slate-200">
                {g.label} <span className="text-slate-400 font-normal">({g.host})</span>
              </p>
              <CheckResultsList results={g.results} />
            </div>
          ))}

          {groups !== null && groups.length > 0 && (
            <div
              className={`rounded-xl px-4 py-3 text-center text-sm font-semibold ${
                overallPass
                  ? "bg-emerald-50 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300"
                  : "bg-red-50 dark:bg-red-500/20 text-red-700 dark:text-red-300"
              }`}
            >
              <i className={`fa-solid ${overallPass ? "fa-circle-check" : "fa-circle-xmark"} mr-1.5`} />
              {overallPass ? "Pass - all checks succeeded" : `Fail - ${failCount} check${failCount === 1 ? "" : "s"} failed`}
            </div>
          )}

          <div className="border-t border-slate-100 dark:border-slate-700/60 pt-4 space-y-2">
            <div className="flex items-center justify-between">
              <h6 className="text-xs font-semibold uppercase tracking-wide text-slate-400">WAN Speed Test</h6>
              {speed.running && (
                <span className="text-xs text-slate-400 flex items-center gap-1.5">
                  <i className="fa-solid fa-circle-notch fa-spin" /> Testing...
                </span>
              )}
            </div>
            {speed.error && <p className="text-sm text-red-500">{speed.error}</p>}
            {(speed.downloadMbps !== null || speed.uploadMbps !== null) && (
              <div className="flex gap-6 text-sm">
                <div>
                  <span className="text-slate-400">Download: </span>
                  <span className="font-semibold text-slate-700 dark:text-slate-200">
                    {speed.downloadMbps !== null ? `${speed.downloadMbps.toFixed(1)} Mbps` : "--"}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400">Upload: </span>
                  <span className="font-semibold text-slate-700 dark:text-slate-200">
                    {speed.uploadMbps !== null ? `${speed.uploadMbps.toFixed(1)} Mbps` : "--"}
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
