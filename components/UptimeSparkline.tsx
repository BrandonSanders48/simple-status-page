"use client";

interface DayUptime {
  date: string;
  upPercent: number | null;
}

function barColor(upPercent: number | null): string {
  // dark:bg-slate-500, not -700 - the service card itself is bg-slate-700 in dark
  // mode (see ServiceCard.tsx), so a -700 bar was invisible against its own background.
  if (upPercent === null) return "bg-slate-200 dark:bg-slate-500";
  if (upPercent >= 99.9) return "bg-emerald-500";
  if (upPercent >= 95) return "bg-amber-400";
  return "bg-red-500";
}

export default function UptimeSparkline({ days }: { days: DayUptime[] }) {
  if (days.length === 0) return null;

  return (
    <div className="flex items-stretch gap-[1.5px] h-3.5 mt-1.5">
      {days.map((d, i) => (
        <div
          key={i}
          className={`flex-1 rounded-[1px] ${barColor(d.upPercent)}`}
          title={`${d.date}: ${d.upPercent === null ? "no data" : `${d.upPercent.toFixed(2)}% up`}`}
        />
      ))}
    </div>
  );
}
