"use client";

import { useCallback, useEffect, useState } from "react";
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

function StepBadge({ step }: { step: number }) {
  return (
    <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-indigo-600 text-white text-xs font-semibold mr-2">
      {step}
    </span>
  );
}

function LockedCard({ step, title, description, onSkip }: { step: number; title: string; description: string; onSkip: () => void }) {
  return (
    <div className="bg-slate-50 dark:bg-slate-900/40 border border-slate-200 dark:border-slate-700 rounded-xl p-5 opacity-60">
      <p className="text-sm font-semibold text-slate-700 dark:text-slate-200 flex items-center">
        <StepBadge step={step} />
        {title}
      </p>
      <p className="text-xs text-slate-400 mt-0.5">{description}</p>
      <p className="text-sm text-slate-500 dark:text-slate-400 mt-3">
        Complete the previous step first, or{" "}
        <button type="button" onClick={onSkip} className="underline hover:text-indigo-600 dark:hover:text-indigo-400">
          skip this step
        </button>
        .
      </p>
    </div>
  );
}

/**
 * Generic "pick a cluster, pick a VMID range, preview, confirm, act" card - used for
 * both starting VMs at DR and shutting down VMs at primary, which are otherwise
 * identical flows with an inverted skip condition and a different destructive action.
 * Optionally gated as one step of the guided failover sequence (locked until the
 * previous step is done or explicitly skipped).
 */
function VmActionCard({
  title,
  description,
  note,
  targets,
  emptyMessage,
  verb,
  actionUrl,
  csrfToken,
  idPrefix,
  step,
  locked,
  onSkip,
  onDone,
}: {
  title: string;
  description: string;
  note?: string;
  targets: { id: number; name: string }[];
  emptyMessage: string;
  verb: "start" | "shutdown";
  actionUrl: string;
  csrfToken?: string;
  idPrefix: string;
  step?: number;
  locked?: boolean;
  onSkip?: () => void;
  onDone?: () => void;
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

  if (locked && onSkip) {
    return <LockedCard step={step ?? 1} title={title} description={description} onSkip={onSkip} />;
  }

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
      onDone?.();
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
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-slate-700 dark:text-slate-200 flex items-center">
            {step !== undefined && <StepBadge step={step} />}
            {title}
          </p>
          <p className="text-xs text-slate-400 mt-0.5">{description}</p>
        </div>
        {onSkip && (
          <button
            type="button"
            onClick={onSkip}
            className="text-xs text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 whitespace-nowrap underline"
          >
            Skip this step
          </button>
        )}
      </div>

      {note && (
        <p className="text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1.5">
          <i className="fa-solid fa-triangle-exclamation" /> {note}
        </p>
      )}

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
 * DR site, each with Promote (the storage half of a failover) and Reprotect (the first
 * step of a later failback, re-establishing replication once the array has been
 * promoted) actions - both gated behind a native confirm dialog spelling out what the
 * action actually does and when it's safe to use, rather than an inline checkbox,
 * since there's normally just one or two sessions rather than a range to preview.
 */
function PromoteMetroCard({
  drPowerstores,
  csrfToken,
  step,
  locked,
  onSkip,
  onDone,
}: {
  drPowerstores: PowerstoreTarget[];
  csrfToken?: string;
  step?: number;
  locked?: boolean;
  onSkip?: () => void;
  onDone?: () => void;
}) {
  const [busySessionId, setBusySessionId] = useState<string | null>(null);
  const [result, setResult] = useState<{ sessionId: string; ok: boolean; text: string } | null>(null);

  const title = "Promote DR datastore";
  const description =
    "Promotes a Metro replication session on the PowerStore array marked as the DR site to read/write, so it can serve as primary storage. Only use this once the primary array is confirmed unreachable. Reprotect re-establishes replication afterward, as the first step of a later failback.";

  if (locked && onSkip) {
    return <LockedCard step={step ?? 1} title={title} description={description} onSkip={onSkip} />;
  }

  async function run(action: "promote" | "reprotect", targetId: number, sessionId: string) {
    if (!csrfToken) return;
    setBusySessionId(sessionId);
    setResult(null);
    try {
      const url = action === "promote" ? "/api/admin/failover/promote-metro" : "/api/admin/failover/reprotect-metro";
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-CSRF-Token": csrfToken },
        body: JSON.stringify({ targetId, sessionId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `Failed to ${action} Metro session.`);
      setResult({ sessionId, ok: true, text: action === "promote" ? "Promoted." : "Reprotected." });
      if (action === "promote") onDone?.();
    } catch (err) {
      setResult({ sessionId, ok: false, text: err instanceof Error ? err.message : `Failed to ${action} Metro session.` });
    } finally {
      setBusySessionId(null);
    }
  }

  function confirmAndRun(action: "promote" | "reprotect", targetId: number, sessionId: string, targetName: string, sessionName: string) {
    const explanation =
      action === "promote"
        ? "This makes the DR array read/write so it can serve as primary storage. Only do this once the primary array is confirmed unreachable - promoting while the primary is still active can cause a split-brain between the two arrays."
        : "This re-establishes replication from the promoted array back toward its original primary, as the first step of a later failback. Only do this once the original primary array is back online and healthy - reprotecting too early can fail or leave replication in a bad state.";
    const verb = action === "promote" ? "Promote" : "Reprotect";
    const confirmed = window.confirm(`${verb} the Metro session "${sessionName}" on ${targetName}?\n\n${explanation}`);
    if (confirmed) run(action, targetId, sessionId);
  }

  const sessions = drPowerstores.flatMap((t) => t.status.metroSessions.map((session) => ({ target: t, session })));

  return (
    <div className="bg-slate-50 dark:bg-slate-900/40 border border-slate-200 dark:border-slate-700 rounded-xl p-5 space-y-4">
      <div>
        <p className="text-sm font-semibold text-slate-700 dark:text-slate-200 flex items-center">
          {step !== undefined && <StepBadge step={step} />}
          {title}
        </p>
        <p className="text-xs text-slate-400 mt-0.5">{description}</p>
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
                <button
                  type="button"
                  onClick={() => confirmAndRun("promote", target.id, session.id, target.name, session.name)}
                  disabled={busySessionId === session.id}
                  className="px-3 py-1.5 bg-white dark:bg-slate-800 border border-red-300 dark:border-red-500/40 text-red-600 dark:text-red-400 text-xs font-medium rounded-lg hover:bg-red-50 dark:hover:bg-red-500/10 disabled:opacity-40"
                >
                  {busySessionId === session.id ? "Working..." : "Promote"}
                </button>
                <button
                  type="button"
                  onClick={() => confirmAndRun("reprotect", target.id, session.id, target.name, session.name)}
                  disabled={busySessionId === session.id}
                  className="px-3 py-1.5 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-300 text-xs font-medium rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-40"
                >
                  {busySessionId === session.id ? "Working..." : "Reprotect"}
                </button>
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

interface LogEntry {
  id: number;
  action: string;
  targetName: string;
  detail: string;
  outcome: "success" | "error";
  errorMessage?: string | null;
  createdAt: string;
}

const ACTION_LABELS: Record<string, string> = {
  start_vms: "Start VMs",
  shutdown_vms: "Shut down VMs",
  promote_metro: "Promote Metro session",
  reprotect_metro: "Reprotect Metro session",
};

function formatLogTime(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

/** Audit trail of Failover tab actions - refetched each time this tab is opened
 * (ServiceTabs unmounts inactive tabs), plus a manual refresh button. */
function FailoverLog() {
  const [entries, setEntries] = useState<LogEntry[] | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    fetch("/api/admin/failover/log")
      .then((r) => r.json())
      .then((data) => setEntries(data.actions ?? []))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="bg-slate-50 dark:bg-slate-900/40 border border-slate-200 dark:border-slate-700 rounded-xl p-5 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">Recent failover actions</p>
        <button
          type="button"
          onClick={load}
          className="text-xs text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 flex items-center gap-1.5"
        >
          <i className="fa-solid fa-rotate-right text-[10px]" /> Refresh
        </button>
      </div>
      {loading && !entries ? (
        <p className="text-sm text-slate-400">Loading...</p>
      ) : !entries || entries.length === 0 ? (
        <p className="text-sm text-slate-500 dark:text-slate-400">No failover actions recorded yet.</p>
      ) : (
        <ul className="space-y-2 max-h-64 overflow-y-auto">
          {entries.map((e) => (
            <li key={e.id} className="flex items-start gap-2 text-sm">
              <span className={`mt-1.5 w-2 h-2 rounded-full flex-shrink-0 ${e.outcome === "success" ? "bg-emerald-500" : "bg-red-500"}`} />
              <div className="flex-1 min-w-0">
                <p className="text-slate-700 dark:text-slate-200">
                  <span className="font-medium">{ACTION_LABELS[e.action] ?? e.action}</span> on {e.targetName}
                </p>
                <p className="text-xs text-slate-400">{e.detail}</p>
                {e.outcome === "error" && e.errorMessage && <p className="text-xs text-red-500">{e.errorMessage}</p>}
              </div>
              <span className="text-xs text-slate-400 whitespace-nowrap">{formatLogTime(e.createdAt)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * Public tab: shows a fail-over-or-not recommendation to everyone (derived from
 * already-fetched Storage data, no separate polling), plus admin-only controls for a
 * guided manual failover - promote the DR datastore, then start DR VMs, in that
 * order, the second step locked until the first is done or explicitly skipped.
 * Reprotect (failback prep) and the action log sit outside the gated sequence since
 * they apply after the fact, not during it.
 */
export default function FailoverSection({
  storage,
  services,
  isAdmin,
  csrfToken,
}: {
  storage: StoragePayload | null;
  services: { up: boolean }[];
  isAdmin: boolean;
  csrfToken?: string;
}) {
  const failover = computeFailoverStatus(storage, services);
  const copy = RECOMMENDATION_COPY[failover.recommendation];
  const drProxmoxes = (storage?.proxmoxes ?? []).filter((t) => t.isDr);
  const drPowerstores = (storage?.powerstores ?? []).filter((t) => t.isDr);

  const [promoteDone, setPromoteDone] = useState(false);

  return (
    <div className="space-y-5">
      <div className={`rounded-xl border p-4 ${copy.className}`}>
        <p className="font-semibold">{copy.label}</p>
        <p className="text-sm mt-1 opacity-90">{copy.detail}</p>
      </div>

      {!isAdmin && (
        <p className="text-sm text-slate-500 dark:text-slate-400 flex items-center gap-2">
          <i className="fa-solid fa-lock text-xs" /> Log in as an admin to start VMs or promote the DR datastore.
        </p>
      )}

      {isAdmin && (
        <div className="space-y-4">
          <PromoteMetroCard step={1} drPowerstores={drPowerstores} csrfToken={csrfToken} onDone={() => setPromoteDone(true)} />
          <VmActionCard
            step={2}
            title="Start VMs at DR site"
            description="Starts QEMU VMs by id range on the Proxmox cluster marked as the DR site. Preview first, this powers on real infrastructure."
            targets={drProxmoxes}
            emptyMessage="No Proxmox cluster is marked as the DR site. Mark one in the admin Proxmox tab first."
            verb="start"
            actionUrl="/api/admin/failover/start"
            csrfToken={csrfToken}
            idPrefix="dr"
            locked={!promoteDone}
            onSkip={() => setPromoteDone(true)}
          />

          <FailoverLog />
        </div>
      )}
    </div>
  );
}
