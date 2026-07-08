import type { ReactNode } from "react";

export function SettingsGroup({
  title,
  description,
  wide = false,
  children,
}: {
  title: string;
  description?: string;
  wide?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="py-6 first:pt-0 border-b border-slate-100 dark:border-slate-800/70 last:border-b-0 grid grid-cols-1 md:grid-cols-[220px_1fr] gap-3 md:gap-10">
      <div>
        <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100">{title}</h3>
        {description && <p className="text-xs text-slate-400 mt-1 leading-relaxed">{description}</p>}
      </div>
      <div className={`space-y-4 ${wide ? "max-w-3xl" : "max-w-xl"}`}>{children}</div>
    </div>
  );
}
