"use client";

interface MaintenanceWindow {
  id: number;
  title: string | null;
  description: string | null;
  startTime: string | null;
  endTime: string | null;
}

function fmt(iso: string): string {
  const d = new Date(iso.replace("T", " "));
  return isNaN(d.getTime()) ? iso : d.toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

export default function MaintenanceBanner({
  windows,
  isAdmin,
  onRemove,
}: {
  windows: MaintenanceWindow[];
  isAdmin: boolean;
  onRemove: (id: number) => void;
}) {
  const now = Date.now();
  const active = windows.filter((w) => !w.endTime || new Date(w.endTime.replace("T", " ")).getTime() >= now);
  if (active.length === 0) return null;

  return (
    <div className="rounded-2xl p-5 mb-5 bg-gradient-to-br from-indigo-50 to-violet-50 dark:from-indigo-500/15 dark:to-violet-500/10 border border-indigo-200/60 dark:border-indigo-400/40">
      <h5 className="flex items-center gap-2 text-base font-semibold mb-3 text-indigo-800 dark:text-indigo-300">
        <i className="fa-solid fa-wrench text-indigo-500" /> Scheduled Maintenance
      </h5>
      <div>
        {active.map((w) => {
          const isOngoing = w.startTime ? new Date(w.startTime.replace("T", " ")).getTime() <= now : false;
          return (
            <div
              key={w.id}
              className="rounded-xl p-4 mb-3 last:mb-0 border bg-white/70 dark:bg-slate-800/40 border-indigo-200/60 dark:border-indigo-400/30"
            >
              <div className="flex justify-between items-start gap-2 mb-1.5">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold text-sm text-slate-900 dark:text-slate-100">{w.title || "Maintenance"}</span>
                  <span
                    className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                      isOngoing
                        ? "bg-amber-100 dark:bg-amber-500/30 text-amber-700 dark:text-amber-200"
                        : "bg-indigo-100 dark:bg-indigo-500/30 text-indigo-700 dark:text-indigo-200"
                    }`}
                  >
                    {isOngoing ? "In Progress" : "Scheduled"}
                  </span>
                </div>
                {isAdmin && (
                  <button
                    type="button"
                    onClick={() => onRemove(w.id)}
                    className="p-1 rounded-md text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 text-xs"
                    title="Remove"
                  >
                    <i className="fa fa-trash" />
                  </button>
                )}
              </div>
              {w.description && <p className="text-sm text-slate-600 dark:text-slate-300 mb-1.5">{w.description}</p>}
              {w.startTime && (
                <p className="text-xs text-slate-400 dark:text-slate-500">
                  <i className="fa-regular fa-clock mr-1 opacity-70" />
                  {fmt(w.startTime)}
                  {w.endTime && <> → {fmt(w.endTime)}</>}
                </p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
