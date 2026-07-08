"use client";

import { useState } from "react";
import ServiceCard from "./ServiceCard";
import Skeleton from "./Skeleton";
import type { StatusServicePayload } from "@/lib/statusCache";

interface Props {
  services: StatusServicePayload[];
  visibleCount: number;
  loading: boolean;
  onOpenOutageLog: () => void;
}

function ServiceCardSkeleton() {
  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-600/60 bg-white dark:bg-slate-700 p-3">
      <div className="flex items-start justify-between gap-1.5 mb-2">
        <Skeleton className="h-3 w-3/4" />
        <Skeleton className="h-3 w-10 rounded-full flex-shrink-0" />
      </div>
      <Skeleton className="h-4 w-14 rounded-full" />
      <Skeleton className="h-2.5 w-full mt-2" />
    </div>
  );
}

export default function ServicesPanel({ services, visibleCount, loading, onOpenOutageLog }: Props) {
  const [expanded, setExpanded] = useState(false);
  const shown = expanded ? services : services.slice(0, visibleCount);
  const hiddenCount = services.length - visibleCount;

  return (
    <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-sm p-5 mb-5">
      <div className="flex items-center justify-between mb-4">
        <h5 className="flex items-center gap-2 text-base font-semibold text-slate-800 dark:text-slate-200">
          <i className="fa-solid fa-server text-indigo-500" /> Internally Hosted Services
        </h5>
        <button
          type="button"
          onClick={onOpenOutageLog}
          className="flex items-center gap-1.5 text-xs font-medium text-slate-500 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors px-2.5 py-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700/50"
        >
          <i className="fa-solid fa-clock-rotate-left text-[11px]" /> Outage History
        </button>
      </div>
      {loading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <ServiceCardSkeleton key={i} />
          ))}
        </div>
      ) : services.length === 0 ? (
        <p className="text-sm text-slate-400 dark:text-slate-500 text-center py-6">No services configured.</p>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-3">
            {shown.map((s) => (
              <ServiceCard key={s.id} service={s} />
            ))}
          </div>
          {hiddenCount > 0 && (
            <div className="mt-3 text-center">
              <button
                type="button"
                onClick={() => setExpanded((v) => !v)}
                className="text-xs font-medium text-slate-500 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors px-3 py-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700/50 inline-flex items-center gap-1.5"
              >
                <i className={`fa-solid ${expanded ? "fa-chevron-up" : "fa-chevron-down"} text-[10px]`} />
                {expanded ? "Show less" : `Show ${hiddenCount} more`}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
