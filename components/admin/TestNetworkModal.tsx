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

interface RunState {
  running: boolean;
  results: CheckResult[] | null;
  error: string | null;
}

const CHECK_NAMES = ["Ping (ICMP)", "DNS", "NTP", "Kerberos", "NPS / RADIUS", "DHCP", "LDAP", "SMB", "LDAPS", "Global Catalog", "Global Catalog (SSL)"];
const IDLE_STATE: RunState = { running: false, results: null, error: null };

async function runTestAgainst(csrfToken: string, host: string): Promise<{ results?: CheckResult[]; error?: string }> {
  try {
    const res = await fetch("/api/admin/test-network", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-CSRF-Token": csrfToken },
      body: JSON.stringify({ host }),
    });
    const data = await res.json();
    if (!res.ok) return { error: data.error || "Test failed." };
    return { results: data.results };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Test failed." };
  }
}

function CheckResultsList({ state }: { state: RunState }) {
  if (!state.running && !state.results && !state.error) return null;
  return (
    <>
      {state.error && <p className="text-sm text-red-500">{state.error}</p>}
      {(state.running || state.results) && (
        <ul className="space-y-2">
          {(state.results ?? []).map((r) => {
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
          {state.running &&
            !state.results &&
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
    </>
  );
}

/**
 * Ad-hoc network diagnostic modal -- runs a fixed battery of AD/DC-style checks
 * (ping, DNS, NTP, Kerberos, NPS/RADIUS, DHCP, LDAP/LDAPS, SMB, Global Catalog)
 * against a host via /api/admin/test-network. Any configured service with type "ad"
 * (see lib/checks/ad.ts) is tested automatically as soon as the modal opens -- no
 * need to retype a domain controller's hostname that's already configured elsewhere
 * -- plus a manual host field for anything else.
 */
export default function TestNetworkModal({
  csrfToken,
  adServices,
  onClose,
}: {
  csrfToken: string;
  adServices: { name: string; host: string }[];
  onClose: () => void;
}) {
  const [adResults, setAdResults] = useState<Record<string, RunState>>({});

  useEffect(() => {
    for (const svc of adServices) {
      setAdResults((prev) => ({ ...prev, [svc.host]: { running: true, results: null, error: null } }));
      runTestAgainst(csrfToken, svc.host).then(({ results, error }) => {
        setAdResults((prev) => ({ ...prev, [svc.host]: { running: false, results: results ?? null, error: error ?? null } }));
      });
    }
    // Only run once per modal open -- adServices/csrfToken aren't expected to change
    // while it's on screen.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [host, setHost] = useState("");
  const [manual, setManual] = useState<RunState>(IDLE_STATE);

  async function runManualTest() {
    const trimmed = host.trim();
    if (!trimmed) return;
    setManual({ running: true, results: null, error: null });
    const { results, error } = await runTestAgainst(csrfToken, trimmed);
    setManual({ running: false, results: results ?? null, error: error ?? null });
  }

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
          {adServices.length > 0 && (
            <div className="space-y-4">
              <h6 className="text-xs font-semibold uppercase tracking-wide text-slate-400">Domain Controllers</h6>
              {adServices.map((svc) => (
                <div key={svc.host} className="space-y-2">
                  <p className="text-sm font-medium text-slate-700 dark:text-slate-200">
                    {svc.name} <span className="text-slate-400 font-normal">({svc.host})</span>
                  </p>
                  <CheckResultsList state={adResults[svc.host] ?? { running: true, results: null, error: null }} />
                </div>
              ))}
              <div className="border-t border-slate-100 dark:border-slate-700/60 pt-4">
                <h6 className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-2">Test another host</h6>
              </div>
            </div>
          )}

          <div className="flex gap-2">
            <input
              type="text"
              value={host}
              onChange={(e) => setHost(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && runManualTest()}
              placeholder="Hostname or IP, e.g. dc01.corp.local"
              className="flex-1 text-sm rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700/60 px-3 py-2 text-slate-800 dark:text-slate-100"
            />
            <button
              type="button"
              onClick={runManualTest}
              disabled={manual.running || !host.trim()}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg whitespace-nowrap disabled:opacity-60"
            >
              {manual.running ? "Testing..." : "Run Test"}
            </button>
          </div>

          <CheckResultsList state={manual} />
        </div>
      </div>
    </div>
  );
}
