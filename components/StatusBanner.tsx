"use client";

interface Props {
  loading: boolean;
  ok: boolean | null;
  live: boolean;
}

export default function StatusBanner({ loading, ok, live }: Props) {
  const label = loading ? "Loading..." : ok ? "All Systems Operational" : "Issues Detected In Your Environment";
  const bg = loading
    ? "bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700"
    : ok
      ? "bg-emerald-50 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border-emerald-400 dark:border-emerald-400"
      : "bg-red-50 dark:bg-red-500/20 text-red-700 dark:text-red-300 border-red-400 dark:border-red-400";

  return (
    <div
      className={`relative rounded-2xl p-6 mb-2 text-center text-2xl font-bold flex items-center justify-center gap-3 shadow-md border-2 ${bg}`}
    >
      {!loading && (
        <span className="text-3xl">
          <i className={`fa-solid ${ok ? "fa-circle-check" : "fa-circle-xmark"}`} />
        </span>
      )}
      <span>{label}</span>
      {live && (
        <span className="flex items-center gap-1.5 text-xs font-semibold tracking-widest opacity-80 absolute right-4 top-1/2 -translate-y-1/2">
          <span className="inline-block w-2 h-2 rounded-full bg-current animate-pulse" />
          LIVE
        </span>
      )}
    </div>
  );
}
