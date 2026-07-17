"use client";

import { useState } from "react";
import { computeFailoverStatus, type FailoverRecommendation } from "@/lib/failover";
import type { StoragePayload, PowerstoreTarget } from "./StorageSections";

interface PreviewVm {
  vmid: number;
  name: string;
  node: string;
  status: string;
}

interface ActionResult {
  vmid: number;
  name: string;
  outcome: "done" | "skipped" | "error";
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
 * Generic "pick a cluster, pick a VMID range, preview, confirm, act" card -- used for
 * both starting VMs at DR and shutting down VMs at primary, which are otherwise
 * identical flows with an inverted skip condition and a different destructive action.
 */
function VmActionCard({
  title,
  description,
  targets,
  emptyMessage,
  verb,
  actionUrl,
  csrfToken,
  idPrefix,
}: {
  title: string;
  description: string;
  targets: { id: number; name: string }[];
  emptyMessage: string;
  verb: "start" | "shutdown";
  actionUrl: string;
  csrfToken?: string;
  idPrefix: string;
}) {
  const isActionable = (status: string) => (verb === "start" ? status !== "running" : status === "running");
  const actionVerb = verb === "start" ? "Start" : "Shut down";
  const doneLabel = verb === "start" ? "Started" : "Shut down";
  const actioningLabel = verb === "start" ? "Starting..." : "Shutting down...";
  const impactVerb = verb === "start" ? "power on" : "shut down";
  const skippedLabel = verb === "start" ? "already running" : "already stopped";

  const [targetId, setTargetId] = useState<number | null>(targets[0]?.id ?? null);
  const [startId, setStartId] = useState(0);
  const [endId, setEndId] = useState(199);
  const [previewing, setPreviewing] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [previewVms, setPreviewVms] = useState<PreviewVm[] | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [acting, setActing] = useState(false);
  const [results, setResults] = useState<ActionResult[] | null>(null);
  const [actError, setActError] = useState<string | null>(null);

  async function preview() {
    if (targetId === null) return;
    setPreviewing(true);
    setPreviewError(null);
    setPreviewVms(null);
    setResults(null);
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

  async function act() {
    if (targetId === null || !csrfToken) return;
    setActing(true);
    setActError(null);
    try {
      const res = await fetch(actionUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-CSRF-Token": csrfToken },
        body: JSON.stringify({ targetId, startId, endId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `Failed to ${verb} VMs.`);
      setResults(
        data.results.map((r: { vmid: number; name: string; outcome: string; error?: string }) => ({
          vmid: r.vmid,
          name: r.name,
          outcome: r.outcome === "started" || r.outcome === "shutdown" ? "done" : r.outcome === "error" ? "error" : "skipped",
          error: r.error,
        }))
      );
      setPreviewVms(null);
      setConfirmed(false);
    } catch (err) {
      setActError(err instanceof Error ? err.message : `Failed to ${verb} VMs.`);
    } finally {
      setActing(false);
    }
  }

  const toAct = previewVms?.filter((vm) => isActionable(vm.status)) ?? [];
  const skipped = previewVms?.filter((vm) => !isActionable(vm.status)) ?? [];

  return (
    <div className="bg-slate-50 dark:bg-slate-900/40 border border-slate-200 dark:border-slate-700 rounded-xl p-5 space-y-4">
      <div>
        <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">{title}</p>
        <p className="text-xs text-slate-400 mt-0.5">{description}</p>
      </div>

      {targets.length === 0 ? (
        <p className="text-sm text-slate-500 dark:text-slate-400">{emptyMessage}</p>
      ) : (
        <>
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label htmlFor={`${idPrefix}-cluster`} className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">
                Cluster
              </label>
              <select
                id={`${idPrefix}-cluster`}
                value={targetId ?? ""}
                onChange={(e) => setTargetId(Number(e.target.value))}
                className="px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
              >
                {targets.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor={`${idPrefix}-start-vmid`} className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">
                Start VMID
              </label>
              <input
                id={`${idPrefix}-start-vmid`}
                type="number"
                min={0}
                value={startId}
                onChange={(e) => setStartId(Number(e.target.value))}
                className="w-24 px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
              />
            </div>
            <div>
              <label htmlFor={`${idPrefix}-end-vmid`} className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">
                End VMID
              </label>
              <input
                id={`${idPrefix}-end-vmid`}
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
                {previewVms.length} VM(s) found in range. {toAct.length} will be {verb === "start" ? "started" : "shut down"},{" "}
                {skipped.length} {skippedLabel} (skipped).
              </p>
              {previewVms.length > 0 && (
                <ul className="max-h-48 overflow-y-auto text-sm divide-y divide-slate-100 dark:divide-slate-700">
                  {previewVms.map((vm) => (
                    <li key={vm.vmid} className="flex items-center gap-2 py-1">
                      <span className="w-14 text-slate-400">#{vm.vmid}</span>
                      <span className="flex-1 truncate">{vm.name}</span>
                      <span className={`text-xs ${vm.status === "running" ? "text-emerald-600" : "text-slate-400"}`}>{vm.status}</span>
                    </li>
                  ))}
                </ul>
              )}

              {toAct.length > 0 && (
                <div className="border border-red-200 dark:border-red-500/30 rounded-lg p-3 space-y-2">
                  <label className="flex items-start gap-2 text-sm text-slate-700 dark:text-slate-200 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={confirmed}
                      onChange={(e) => setConfirmed(e.target.checked)}
                      className="w-4 h-4 mt-0.5 accent-red-600"
                    />
                    I understand this will {impactVerb} {toAct.length} VM(s).
                  </label>
                  <button
                    type="button"
                    onClick={act}
                    disabled={!confirmed || acting}
                    className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-sm font-medium rounded-lg disabled:opacity-40"
                  >
                    {acting ? actioningLabel : `${actionVerb} ${toAct.length} VM(s)`}
                  </button>
                </div>
              )}
            </div>
          )}

          {actError && <p className="text-sm text-red-500">{actError}</p>}

          {results && (
            <div>
              <p className="text-xs text-slate-400 mb-1">Results</p>
              <ul className="text-sm space-y-1">
                {results.map((r) => (
                  <li key={r.vmid} className="flex items-center gap-2">
                    <span className="w-14 text-slate-400">#{r.vmid}</span>
                    <span className="flex-1 truncate">{r.name}</span>
                    <span className={r.outcome === "error" ? "text-red-500" : "text-emerald-600"}>
                      {r.outcome === "done" ? doneLabel : r.outcome === "skipped" ? "Skipped" : `Error: ${r.error}`}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </div>
  );
}

/**
 * Lists Metro replication sessions on whichever PowerStore array(s) are flagged as the
 * DR site, each with a Promote action (double-confirmed inline, not via checkbox,
 * since there's normally just one or two sessions rather than a range to preview).
 */
function PromoteMetroCard({ drPowerstores, csrfToken }: { drPowerstores: PowerstoreTarget[]; csrfToken?: string }) {
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [promoting, setPromoting] = useState<string | null>(null);
  const [result, setResult] = useState<{ sessionId: string; ok: boolean; text: string } | null>(null);

  async function promote(targetId: number, sessionId: string) {
    if (!csrfToken) return;
    setPromoting(sessionId);
    setResult(null);
    try {
      const res = await fetch("/api/admin/failover/promote-metro", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-CSRF-Token": csrfToken },
        body: JSON.stringify({ targetId, sessionId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to promote Metro session.");
      setResult({ sessionId, ok: true, text: "Promoted." });
    } catch (err) {
      setResult({ sessionId, ok: false, text: err instanceof Error ? err.message : "Failed to promote Metro session." });
    } finally {
      setPromoting(null);
      setConfirmingId(null);
    }
  }

  const sessions = drPowerstores.flatMap((t) => t.status.metroSessions.map((session) => ({ target: t, session })));

  return (
    <div className="bg-slate-50 dark:bg-slate-900/40 border border-slate-200 dark:border-slate-700 rounded-xl p-5 space-y-4">
      <div>
        <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">Promote DR datastore</p>
        <p className="text-xs text-slate-400 mt-0.5">
          Promotes a Metro replication session on the PowerStore array marked as the DR site to read/write, so it can serve as primary
          storage. Only use this once the primary array is confirmed unreachable.
        </p>
      </div>

      {drPowerstores.length === 0 ? (
        <p className="text-sm text-slate-500 dark:text-slate-400">
          No PowerStore array is marked as the DR site. Mark one in the admin Storage tab first.
        </p>
      ) : sessions.length === 0 ? (
        <p className="text-sm text-slate-500 dark:text-slate-400">No Metro replication sessions found on the DR-marked array(s).</p>
      ) : (
        <ul className="space-y-2">
          {sessions.map(({ target, session }) => (
            <li
              key={`${target.id}-${session.id}`}
              className="flex flex-wrap items-center gap-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg p-3"
            >
              <span className="text-sm font-medium text-slate-700 dark:text-slate-200">{target.name}</span>
              <span className="text-sm text-slate-500 dark:text-slate-400">{session.name}</span>
              <span className="text-xs text-slate-400">{session.state}</span>
              <div className="ml-auto flex items-center gap-2">
                {confirmingId === session.id ? (
                  <>
                    <span className="text-xs text-slate-500 dark:text-slate-400">Promote this session?</span>
                    <button
                      type="button"
                      onClick={() => promote(target.id, session.id)}
                      disabled={promoting === session.id}
                      className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white text-xs font-medium rounded-lg disabled:opacity-40"
                    >
                      {promoting === session.id ? "Promoting..." : "Confirm"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmingId(null)}
                      className="text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
                    >
                      Cancel
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirmingId(session.id)}
                    className="px-3 py-1.5 bg-white dark:bg-slate-800 border border-red-300 dark:border-red-500/40 text-red-600 dark:text-red-400 text-xs font-medium rounded-lg hover:bg-red-50 dark:hover:bg-red-500/10"
                  >
                    Promote
                  </button>
                )}
              </div>
              {result?.sessionId === session.id && (
                <p className={`w-full text-xs ${result.ok ? "text-emerald-600" : "text-red-500"}`}>{result.text}</p>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * Public tab: shows a fail-over-or-not recommendation to everyone (derived from
 * already-fetched Storage data, no separate polling), plus admin-only controls to
 * start VMs at the DR site and shut down VMs at the primary site, by VMID range.
 * Both are genuinely consequential, so both require a preview step and an explicit
 * confirmation checkbox before anything fires.
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
  const primaryProxmoxes = (storage?.proxmoxes ?? []).filter((t) => !t.isDr);
  const drPowerstores = (storage?.powerstores ?? []).filter((t) => t.isDr);

  return (
    <div className="space-y-5">
      <div className={`rounded-xl border p-4 ${copy.className}`}>
        <p className="font-semibold">{copy.label}</p>
        <p className="text-sm mt-1 opacity-90">{copy.detail}</p>
      </div>

      {isAdmin && (
        <div className="space-y-4">
          <PromoteMetroCard drPowerstores={drPowerstores} csrfToken={csrfToken} />
          <VmActionCard
            title="Start VMs at DR site"
            description="Starts QEMU VMs by id range on the Proxmox cluster marked as the DR site. Preview first, this powers on real infrastructure."
            targets={drProxmoxes}
            emptyMessage="No Proxmox cluster is marked as the DR site. Mark one in the admin Proxmox tab first."
            verb="start"
            actionUrl="/api/admin/failover/start"
            csrfToken={csrfToken}
            idPrefix="dr"
          />
          <VmActionCard
            title="Shut down VMs at primary site"
            description="Gracefully (ACPI) shuts down QEMU VMs by id range on a primary (non-DR) Proxmox cluster. Preview first, this powers off real infrastructure."
            targets={primaryProxmoxes}
            emptyMessage="No primary Proxmox cluster is available (either none is configured, or every configured cluster is marked as the DR site)."
            verb="shutdown"
            actionUrl="/api/admin/failover/shutdown"
            csrfToken={csrfToken}
            idPrefix="primary"
          />
        </div>
      )}
    </div>
  );
}
