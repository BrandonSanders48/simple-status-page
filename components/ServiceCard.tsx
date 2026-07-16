"use client";

import { useEffect, useState } from "react";
import { formatDuration, formatTimestamp } from "@/lib/format";
import type { StatusServicePayload } from "@/lib/statusCache";
import UptimeSparkline from "./UptimeSparkline";

interface DayUptime {
  date: string;
  upPercent: number | null;
}

export default function ServiceCard({ service, uptime }: { service: StatusServicePayload; uptime?: DayUptime[] }) {
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));

  useEffect(() => {
    if (service.up || !service.wentDownAt) return;
    const id = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000);
    return () => clearInterval(id);
  }, [service.up, service.wentDownAt]);

  const tipLines: string[] = [];
  const conn = service.port ? `${service.host} · ${service.port}` : service.host;
  tipLines.push(conn);
  if (service.lastDownAt) {
    tipLines.push(`Last offline: ${formatTimestamp(service.lastDownAt)}`);
    if (service.lastDownDurationS) tipLines.push(`Duration: ${formatDuration(service.lastDownDurationS)}`);
  }

  return (
    <div
      className="rounded-xl border border-slate-200 dark:border-slate-600/60 bg-white dark:bg-slate-700 p-3"
      title={tipLines.join("\n")}
    >
      <div className="flex items-start justify-between gap-1.5 mb-2">
        <h5 className="font-semibold text-xs text-slate-800 dark:text-slate-100 leading-tight">{service.name}</h5>
        {service.up ? (
          <span className="flex-shrink-0 inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
            <span className="w-1.5 h-1.5 rounded-full bg-current" /> Up
          </span>
        ) : (
          <span className="flex-shrink-0 inline-flex items-center gap-1 text-[11px] font-semibold text-red-600 dark:text-red-400">
            <span className="w-1.5 h-1.5 rounded-full bg-current" /> Down
          </span>
        )}
      </div>
      <span className="inline-block text-[10px] font-medium px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-600 text-slate-500 dark:text-slate-200">
        {service.type}
      </span>
      {service.description && (
        <p className="text-[11px] text-slate-400 dark:text-slate-500 leading-snug mt-2">{service.description}</p>
      )}
      {!service.up && service.wentDownAt && (
        <p className="text-[10px] font-mono mt-1.5 text-red-600 dark:text-red-400">
          {formatDuration(now - service.wentDownAt)}
        </p>
      )}
      {uptime && uptime.length > 0 && <UptimeSparkline days={uptime} />}
    </div>
  );
}
