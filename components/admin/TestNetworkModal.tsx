"use client";

import { useEffect, useState } from "react";

interface CheckResult {
  name: string;
  port: number | null;
  /** null = inconclusive (see DHCP/RADIUS `detail` -- a silent non-reply from those
   * doesn't necessarily mean the service is down), not a confirmed pass or fail. */
  ok: boolean | null;
  detail?: string;
  ms: number;
}

interface ResultGroup {
  label: string;
  host: string;
  results: CheckResult[];
}

const CHECK_NAMES = ["Ping (ICMP)", "DNS", "NTP", "Kerberos", "NPS / RADIUS", "DHCP", "LDAP", "SMB", "LDAPS", "Global Catalog", "Global Catalog (SSL)"];

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

/**
 * Network diagnostic modal -- runs a fixed battery of AD/DC-style checks (ping,
 * DNS, NTP, Kerberos, NPS/RADIUS, DHCP, LDAP/LDAPS, SMB, Global Catalog) against
 * every domain controller configured under Services (type "ad") plus this site's
 * configured WAN targets (Settings > Network's Gateway Host and Public DNS Host),
 * automatically as soon as it opens.
 *
 * Deliberately has no free-form host field -- letting a visitor test an arbitrary
 * host/port was a real SSRF/scanning-proxy surface (see the API route), so the
 * target list is exactly what's already configured elsewhere, nothing else.
 */
export default function TestNetworkModal({ csrfToken, onClose }: { csrfToken: string; onClose: () => void }) {
  const [groups, setGroups] = useState<ResultGroup[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/admin/test-network", { method: "POST", headers: { "Content-Type": "application/json", "X-CSRF-Token": csrfToken }, body: "{}" })
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Test failed.");
        setGroups(data.groups);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Test failed."));
    // Runs once per modal open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

        <div className="px-6 py-4 space-y-5 overflow-y-auto">
          {error && <p className="text-sm text-red-500">{error}</p>}

          {!error && groups === null && (
            <div className="space-y-2">
              <p className="text-sm font-medium text-slate-700 dark:text-slate-200">Testing...</p>
              <PendingList />
            </div>
          )}

          {groups !== null && groups.length === 0 && (
            <p className="text-sm text-slate-400 dark:text-slate-500">
              Nothing configured to test -- add a Service with type &quot;ad&quot;, or set a Gateway Host / Public DNS Host under Settings &gt;
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
        </div>
      </div>
    </div>
  );
}
