"use client";

import { useEffect, useState } from "react";

interface SlaData {
  enabled: boolean;
  target?: number;
  periodDays?: number;
  uptimePercent?: number;
}

export default function SlaBadge() {
  const [data, setData] = useState<SlaData | null>(null);

  useEffect(() => {
    const load = () => fetch("/api/sla").then((r) => r.json()).then(setData).catch(() => {});
    load();
    // Underlying downtime data only changes on the 2-min background check cycle, so
    // there's no need to poll as frequently as the live status.
    const timer = setInterval(load, 5 * 60 * 1000);
    return () => clearInterval(timer);
  }, []);

  if (!data?.enabled || data.uptimePercent === undefined || data.target === undefined) return null;

  const meetsTarget = data.uptimePercent >= data.target;

  return (
    <span
      title={`${data.uptimePercent.toFixed(3)}% uptime over the last ${data.periodDays} days (target ${data.target}%)`}
      className={`text-[11px] font-medium ${meetsTarget ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}
    >
      SLA {data.uptimePercent.toFixed(2)}%
    </span>
  );
}
