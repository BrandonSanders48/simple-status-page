"use client";

interface Incident {
  id: number;
  title: string;
  description: string | null;
  severity: "degraded" | "outage" | "maintenance" | "resolved";
  startTime: string;
  endTime: string | null;
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

function fmt(iso: string): string {
  const d = new Date(iso.replace("T", " "));
  return isNaN(d.getTime()) ? iso : d.toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

export default function IncidentsPanel({
  incidents,
  isAdmin,
  onRemove,
}: {
  incidents: Incident[];
  isAdmin: boolean;
  onRemove: (id: number) => void;
}) {
  if (incidents.length === 0) return null;

  return (
    <div className="rounded-2xl p-5 mb-5 bg-gradient-to-br from-orange-50 to-red-50 dark:from-orange-500/15 dark:to-red-500/10 border border-orange-200/60 dark:border-orange-400/40">
      <h5 className="flex items-center gap-2 text-base font-semibold mb-3 text-orange-800 dark:text-orange-300">
        <i className="fa-solid fa-triangle-exclamation text-amber-500" /> Incidents
      </h5>
      <div>
        {incidents.map((incident) => {
          const sev = SEVERITY_STYLES[incident.severity] ?? SEVERITY_STYLES.outage;
          return (
            <div key={incident.id} className={`rounded-xl p-4 mb-3 last:mb-0 border ${sev.bg}`}>
              <div className="flex justify-between items-start gap-2 mb-1.5">
                <div className="flex items-center gap-2 flex-wrap">
                  <i className={`fa-solid ${sev.icon} text-sm`} />
                  <span className="font-semibold text-sm text-slate-900 dark:text-slate-100">{incident.title}</span>
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${sev.badge}`}>{sev.label}</span>
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
            </div>
          );
        })}
      </div>
    </div>
  );
}
