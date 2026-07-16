"use client";

import { useState } from "react";

interface IncidentUpdate {
  id: number;
  status: "investigating" | "identified" | "monitoring" | "resolved";
  message: string;
  createdAt: string;
}

interface Incident {
  id: number;
  title: string;
  description: string | null;
  severity: "degraded" | "outage" | "maintenance" | "resolved";
  startTime: string;
  endTime: string | null;
  updates?: IncidentUpdate[];
}

const SEVERITY_STYLES: Record<Incident["severity"], { bg: string; icon: string; badge: string; label: string }> = {
  degraded: {
    bg: "bg-amber-50 dark:bg-amber-500/15 border-amber-200 dark:border-amber-400/50",
    icon: "fa-circle-minus text-amber-500",
    badge: "bg-amber-100 dark:bg-amber-500/30 text-amber-700 dark:text-amber-200",
    label: "Degraded",
  },
  outage: {
    bg: "bg-red-50 dark:bg-red-500/15 border-red-200 dark:border-red-400/50",
    icon: "fa-circle-xmark text-red-500",
    badge: "bg-red-100 dark:bg-red-500/30 text-red-700 dark:text-red-200",
    label: "Outage",
  },
  maintenance: {
    bg: "bg-indigo-50 dark:bg-indigo-500/15 border-indigo-200 dark:border-indigo-400/50",
    icon: "fa-wrench text-indigo-500",
    badge: "bg-indigo-100 dark:bg-indigo-500/30 text-indigo-700 dark:text-indigo-200",
    label: "Maintenance",
  },
  resolved: {
    bg: "bg-emerald-50 dark:bg-emerald-500/15 border-emerald-200 dark:border-emerald-400/50",
    icon: "fa-circle-check text-emerald-500",
    badge: "bg-emerald-100 dark:bg-emerald-500/30 text-emerald-700 dark:text-emerald-200",
    label: "Resolved",
  },
};

const UPDATE_STATUS_LABELS: Record<IncidentUpdate["status"], string> = {
  investigating: "Investigating",
  identified: "Identified",
  monitoring: "Monitoring",
  resolved: "Resolved",
};

function fmt(iso: string): string {
  const d = new Date(iso.replace("T", " "));
  return isNaN(d.getTime()) ? iso : d.toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

export interface StatusCategory {
  key: string;
  label: string;
  color: string;
}

function AddUpdateForm({
  incidentId,
  csrfToken,
  onDone,
}: {
  incidentId: number;
  csrfToken: string;
  onDone: () => void;
}) {
  const [status, setStatus] = useState<IncidentUpdate["status"]>("investigating");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!message.trim()) return;
    setSubmitting(true);
    setError("");
    try {
      const res = await fetch(`/api/incidents/${incidentId}/updates`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-CSRF-Token": csrfToken },
        body: JSON.stringify({ status, message: message.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to post update.");
      setMessage("");
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to post update.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={submit} className="ml-6 mt-2 flex flex-col gap-2">
      {error && <p className="text-xs text-red-500">{error}</p>}
      <div className="flex gap-2">
        <select
          aria-label="Update status"
          value={status}
          onChange={(e) => setStatus(e.target.value as IncidentUpdate["status"])}
          className="text-xs border border-slate-200 dark:border-slate-600 rounded-lg px-2 py-1.5 bg-white dark:bg-slate-700/60"
        >
          {(Object.keys(UPDATE_STATUS_LABELS) as IncidentUpdate["status"][]).map((s) => (
            <option key={s} value={s}>
              {UPDATE_STATUS_LABELS[s]}
            </option>
          ))}
        </select>
        <input
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="What's new..."
          className="flex-1 text-xs border border-slate-200 dark:border-slate-600 rounded-lg px-2.5 py-1.5 bg-white dark:bg-slate-700/60"
        />
        <button
          type="submit"
          disabled={submitting || !message.trim()}
          className="text-xs font-semibold px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg disabled:opacity-50"
        >
          Post
        </button>
      </div>
    </form>
  );
}

export default function IncidentsPanel({
  incidents,
  isAdmin,
  onRemove,
  categories = [],
  csrfToken,
  onChanged,
}: {
  incidents: Incident[];
  isAdmin: boolean;
  onRemove: (id: number) => void;
  categories?: StatusCategory[];
  csrfToken?: string;
  onChanged?: () => void;
}) {
  const [addingTo, setAddingTo] = useState<number | null>(null);

  if (incidents.length === 0) return null;

  return (
    <div className="rounded-2xl p-5 mb-5 bg-gradient-to-br from-orange-50 to-red-50 dark:from-orange-500/15 dark:to-red-500/10 border border-orange-200/60 dark:border-orange-400/40">
      <h5 className="flex items-center gap-2 text-base font-semibold mb-3 text-orange-800 dark:text-orange-300">
        <i className="fa-solid fa-triangle-exclamation text-amber-500" /> Incidents
      </h5>
      <div>
        {incidents.map((incident) => {
          const sev = SEVERITY_STYLES[incident.severity] ?? SEVERITY_STYLES.outage;
          const category = categories.find((c) => c.key === incident.severity);
          return (
            <div key={incident.id} className={`rounded-xl p-4 mb-3 last:mb-0 border ${sev.bg}`}>
              <div className="flex justify-between items-start gap-2 mb-1.5">
                <div className="flex items-center gap-2 flex-wrap">
                  <i className={`fa-solid ${sev.icon} text-sm`} />
                  <span className="font-semibold text-sm text-slate-900 dark:text-slate-100">{incident.title}</span>
                  {category ? (
                    <span
                      className="text-xs font-medium px-2 py-0.5 rounded-full text-white"
                      style={{ backgroundColor: category.color }}
                    >
                      {category.label}
                    </span>
                  ) : (
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${sev.badge}`}>{sev.label}</span>
                  )}
                </div>
                {isAdmin && (
                  <button
                    type="button"
                    onClick={() => onRemove(incident.id)}
                    className="p-1 rounded-md text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 text-xs"
                    title="Remove"
                  >
                    <i className="fa fa-trash" />
                  </button>
                )}
              </div>
              {incident.description && (
                <p className="text-sm text-slate-600 dark:text-slate-300 ml-6 mb-1.5">{incident.description}</p>
              )}
              <p className="text-xs text-slate-400 dark:text-slate-500 ml-6">
                <i className="fa-regular fa-clock mr-1 opacity-70" />
                {fmt(incident.startTime)}
                {incident.endTime ? (
                  <> → {fmt(incident.endTime)}</>
                ) : (
                  <span className="ml-1 text-[10px] font-semibold px-1.5 py-0.5 rounded bg-amber-200/60 dark:bg-amber-500/30 text-amber-700 dark:text-amber-200">
                    Ongoing
                  </span>
                )}
              </p>

              {incident.updates && incident.updates.length > 0 && (
                <ul className="ml-6 mt-2.5 pl-3 border-l-2 border-slate-200 dark:border-slate-600/60 space-y-2">
                  {incident.updates.map((u) => (
                    <li key={u.id} className="text-xs">
                      <span className="font-semibold text-slate-700 dark:text-slate-200">{UPDATE_STATUS_LABELS[u.status]}</span>
                      <span className="text-slate-400 dark:text-slate-500 ml-1.5">{fmt(u.createdAt)}</span>
                      <p className="text-slate-600 dark:text-slate-300 mt-0.5">{u.message}</p>
                    </li>
                  ))}
                </ul>
              )}

              {isAdmin && csrfToken && (
                <>
                  {addingTo === incident.id ? (
                    <AddUpdateForm
                      incidentId={incident.id}
                      csrfToken={csrfToken}
                      onDone={() => {
                        setAddingTo(null);
                        onChanged?.();
                      }}
                    />
                  ) : (
                    <button
                      type="button"
                      onClick={() => setAddingTo(incident.id)}
                      className="ml-6 mt-2 text-xs font-medium text-slate-500 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400"
                    >
                      <i className="fa-solid fa-plus text-[10px] mr-1" /> Add update
                    </button>
                  )}
                </>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
