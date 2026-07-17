"use client";

import { useState } from "react";
import { computeFailoverStatus, type FailoverRecommendation } from "@/lib/failover";
import type { StoragePayload } from "./StorageSections";

interface PreviewVm {
  vmid: number;
  name: string;
  node: string;
  status: string;
}

interface StartResult {
  vmid: number;
  name: string;
  outcome: "started" | "already-running" | "error";
  error?: string;
}

const RECOMMENDATION_COPY: Record<FailoverRecommendation, { label: string; className: string; detail: string }> = {
  healthy: {
    label: "No failover needed",
    className:
      "bg-emerald-50 dark:bg-emerald-500/10 border-emerald-200 dark:border-emerald-500/30 text-emerald-700 dark:text-emerald-300",
    detail: "The primary site is healthy.",
  },
  recommend: {
    label: "Failover to DR recommended",
    className: "bg-red-50 dark:bg-red-500/10 border-red-200 dark:border-red-500/30 text-red-700 dark:text-red-300",
    detail: "The primary site looks unhealthy and the DR site looks ready.",
  },
  caution: {
    label: "Caution: both sites show issues",
    className: "bg-amber-50 dark:bg-amber-500/10 border-amber-200 dark:border-amber-500/30 text-amber-700 dark:text-amber-300",
    detail: "The primary site looks unhealthy, but the DR site is showing issues too. Investigate before failing over.",
  },
  unconfigured: {
    label: "No DR site configured",
    className: "bg-slate-50 dark:bg-slate-700/30 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300",
    detail: "Mark a PowerStore array or Proxmox cluster as the DR site in the admin Storage/Proxmox tabs to enable failover recommendations.",
  },
};

/**
 * Public tab: shows a fail-over-or-not recommendation to everyone (derived from
 * already-fetched Storage data, no separate polling), plus admin-only controls to
 * start VMs at the DR site by id range. Starting VMs is genuinely consequential, so it
 * requires a preview step and an explicit confirmation checkbox before anything fires.
 */
export default function FailoverSection({
  storage,
  isAdmin,
  csrfToken,
}: {
  storage: StoragePayload | null;
  isAdmin: boolean;
  csrfToken?: string;
}) {
  const failover = computeFailoverStatus(storage);
  const copy = RECOMMENDATION_COPY[failover.recommendation];
  const drProxmoxes = (storage?.proxmoxes ?? []).filter((t) => t.isDr);

  const [targetId, setTargetId] = useState<number | null>(drProxmoxes[0]?.id ?? null);
  const [startId, setStartId] = useState(0);
  const [endId, setEndId] = useState(199);
  const [previewing, setPreviewing] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [previewVms, setPreviewVms] = useState<PreviewVm[] | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [starting, setStarting] = useState(false);
  const [startResults, setStartResults] = useState<StartResult[] | null>(null);
  const [startError, setStartError] = useState<string | null>(null);

  async function preview() {
    if (targetId === null) return;
    setPreviewing(true);
    setPreviewError(null);
    setPreviewVms(null);
    setStartResults(null);
    setConfirmed(false);
    try {
      const res = await fetch(`/api/admin/failover/vms?targetId=${targetId}&start=${startId}&end=${endId}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to list VMs.");
      setPreviewVms(data.vms);
    } catch (err) {
      setPreviewError(err instanceof Error ? err.message : "Failed to list VMs.");
    } finally {
      setPreviewing(false);
    }
  }

  async function start() {
    if (targetId === null || !csrfToken) return;
    setStarting(true);
    setStartError(null);
    try {
      const res = await fetch("/api/admin/failover/start", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-CSRF-Token": csrfToken },
        body: JSON.stringify({ targetId, startId, endId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to start VMs.");
      setStartResults(data.results);
      setPreviewVms(null);
      setConfirmed(false);
    } catch (err) {
      setStartError(err instanceof Error ? err.message : "Failed to start VMs.");
    } finally {
      setStarting(false);
    }
  }

  const toStart = previewVms?.filter((vm) => vm.status !== "running") ?? [];
  const alreadyRunning = previewVms?.filter((vm) => vm.status === "running") ?? [];

  return (
    <div className="space-y-5">
      <div className={`rounded-xl border p-4 ${copy.className}`}>
        <p className="font-semibold">{copy.label}</p>
        <p className="text-sm mt-1 opacity-90">{copy.detail}</p>
      </div>

      {isAdmin && (
        <div className="bg-slate-50 dark:bg-slate-900/40 border border-slate-200 dark:border-slate-700 rounded-xl p-5 space-y-4">
          <div>
            <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">Start VMs at DR site</p>
            <p className="text-xs text-slate-400 mt-0.5">
              Starts QEMU VMs by id range on the Proxmox cluster marked as the DR site. Preview first, this powers on real infrastructure.
            </p>
          </div>

          {drProxmoxes.length === 0 ? (
            <p className="text-sm text-slate-500 dark:text-slate-400">
              No Proxmox cluster is marked as the DR site. Mark one in the admin Proxmox tab first.
            </p>
          ) : (
            <>
              <div className="flex flex-wrap items-end gap-3">
                <div>
                  <label htmlFor="failover-dr-cluster" className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">
                    DR cluster
                  </label>
                  <select
                    id="failover-dr-cluster"
                    value={targetId ?? ""}
                    onChange={(e) => setTargetId(Number(e.target.value))}
                    className="px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
                  >
                    {drProxmoxes.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="failover-start-vmid" className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">
                    Start VMID
                  </label>
                  <input
                    id="failover-start-vmid"
                    type="number"
                    min={0}
                    value={startId}
                    onChange={(e) => setStartId(Number(e.target.value))}
                    className="w-24 px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
                  />
                </div>
                <div>
                  <label htmlFor="failover-end-vmid" className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">
                    End VMID
                  </label>
                  <input
                    id="failover-end-vmid"
                    type="number"
                    min={startId}
                    value={endId}
                    onChange={(e) => setEndId(Number(e.target.value))}
                    className="w-24 px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
                  />
                </div>
                <button
                  type="button"
                  onClick={preview}
                  disabled={previewing}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg disabled:opacity-60"
                >
                  {previewing ? "Loading..." : "Preview"}
                </button>
              </div>

              {previewError && <p className="text-sm text-red-500">{previewError}</p>}

              {previewVms && (
                <div className="space-y-3">
                  <p className="text-sm text-slate-600 dark:text-slate-300">
                    {previewVms.length} VM(s) found in range. {toStart.length} will be started, {alreadyRunning.length} already running
                    (skipped).
                  </p>
                  {previewVms.length > 0 && (
                    <ul className="max-h-48 overflow-y-auto text-sm divide-y divide-slate-100 dark:divide-slate-700">
                      {previewVms.map((vm) => (
                        <li key={vm.vmid} className="flex items-center gap-2 py-1">
                          <span className="w-14 text-slate-400">#{vm.vmid}</span>
                          <span className="flex-1 truncate">{vm.name}</span>
                          <span className={`text-xs ${vm.status === "running" ? "text-emerald-600" : "text-slate-400"}`}>
                            {vm.status}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}

                  {toStart.length > 0 && (
                    <div className="border border-red-200 dark:border-red-500/30 rounded-lg p-3 space-y-2">
                      <label className="flex items-start gap-2 text-sm text-slate-700 dark:text-slate-200 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={confirmed}
                          onChange={(e) => setConfirmed(e.target.checked)}
                          className="w-4 h-4 mt-0.5 accent-red-600"
                        />
                        I understand this will power on {toStart.length} VM(s) at the DR site.
                      </label>
                      <button
                        type="button"
                        onClick={start}
                        disabled={!confirmed || starting}
                        className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-sm font-medium rounded-lg disabled:opacity-40"
                      >
                        {starting ? "Starting..." : `Start ${toStart.length} VM(s)`}
                      </button>
                    </div>
                  )}
                </div>
              )}

              {startError && <p className="text-sm text-red-500">{startError}</p>}

              {startResults && (
                <div>
                  <p className="text-xs text-slate-400 mb-1">Results</p>
                  <ul className="text-sm space-y-1">
                    {startResults.map((r) => (
                      <li key={r.vmid} className="flex items-center gap-2">
                        <span className="w-14 text-slate-400">#{r.vmid}</span>
                        <span className="flex-1 truncate">{r.name}</span>
                        <span className={r.outcome === "error" ? "text-red-500" : "text-emerald-600"}>
                          {r.outcome === "started" ? "Started" : r.outcome === "already-running" ? "Already running" : `Error: ${r.error}`}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
