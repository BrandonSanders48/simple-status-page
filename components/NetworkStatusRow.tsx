"use client";

import Skeleton from "./Skeleton";

interface NetStatus {
  ok: boolean | null;
  text: string;
}

interface Props {
  local: NetStatus | null;
  wide: NetStatus | null;
}

function colorFor(ok: boolean | null): string {
  if (ok === null) return "text-slate-400";
  return ok ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400";
}

export default function NetworkStatusRow({ local, wide }: Props) {
  return (
    <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-sm px-5 py-4 mb-5">
      <div className="flex flex-wrap justify-between items-center gap-4">
        <div className="flex items-center gap-3">
          <span className="text-sm font-medium text-slate-500 dark:text-slate-400">Local-Area Network:</span>
          {local ? (
            <span className={`text-sm font-bold ${colorFor(local.ok)}`}>{local.text}</span>
          ) : (
            <Skeleton className="h-3.5 w-20" />
          )}
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm font-medium text-slate-500 dark:text-slate-400">Wide-Area Network:</span>
          {wide ? (
            <span className={`text-sm font-bold ${colorFor(wide.ok)}`}>{wide.text}</span>
          ) : (
            <Skeleton className="h-3.5 w-48" />
          )}
        </div>
      </div>
    </div>
  );
}
