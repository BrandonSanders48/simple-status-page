"use client";

import type { StatusCategoryRow } from "@/lib/adminTypes";
import { inputCls, labelCls } from "./styles";
import { SettingsGroup } from "./SettingsGroup";

export default function StatusCategoriesTab({
  categories,
  onChange,
}: {
  categories: StatusCategoryRow[];
  onChange: (c: StatusCategoryRow[]) => void;
}) {
  function update(key: string, patch: Partial<StatusCategoryRow>) {
    onChange(categories.map((c) => (c.key === key ? { ...c, ...patch } : c)));
  }

  return (
    <div>
      <SettingsGroup
        title="Status Labels & Colors"
        description="Labels and colors used for incident severity badges across the public status page."
        wide
      >
        <div className="space-y-3">
          {categories.map((cat) => (
            <div key={cat.key} className="grid grid-cols-[100px_1fr_60px] items-center gap-3">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">{cat.key}</span>
              <div>
                <label htmlFor={`cat-label-${cat.key}`} className={labelCls}>Label</label>
                <input
                  id={`cat-label-${cat.key}`}
                  className={inputCls}
                  value={cat.label}
                  onChange={(e) => update(cat.key, { label: e.target.value })}
                />
              </div>
              <div>
                <label htmlFor={`cat-color-${cat.key}`} className={labelCls}>Color</label>
                <input
                  id={`cat-color-${cat.key}`}
                  type="color"
                  className="w-full h-9 rounded-lg cursor-pointer border border-slate-200 dark:border-slate-600"
                  value={cat.color}
                  onChange={(e) => update(cat.key, { color: e.target.value })}
                />
              </div>
            </div>
          ))}
        </div>
      </SettingsGroup>
    </div>
  );
}
