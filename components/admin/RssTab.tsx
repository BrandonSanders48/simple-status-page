"use client";

import type { RssFeedRow } from "@/lib/adminTypes";
import { tblInputCls } from "./styles";

const MAX_RSS_FEEDS = 10;

export type DraftFeed = Omit<RssFeedRow, "id"> & { id?: number };

export default function RssTab({ feeds, onChange }: { feeds: DraftFeed[]; onChange: (f: DraftFeed[]) => void }) {
  function update(index: number, patch: Partial<DraftFeed>) {
    const next = feeds.slice();
    next[index] = { ...next[index], ...patch } as DraftFeed;
    onChange(next);
  }

  function remove(index: number) {
    onChange(feeds.filter((_, i) => i !== index));
  }

  function move(index: number, dir: -1 | 1) {
    const target = index + dir;
    if (target < 0 || target >= feeds.length) return;
    const next = feeds.slice();
    const [item] = next.splice(index, 1);
    next.splice(target, 0, item!);
    onChange(next);
  }

  function addRow() {
    if (feeds.length >= MAX_RSS_FEEDS) return;
    onChange([...feeds, { name: "", host: "", tag: "item", description: "", sortOrder: feeds.length }]);
  }

  return (
    <div>
      <div className="overflow-x-auto border border-slate-100 dark:border-slate-800 rounded-xl px-3">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="text-[10.5px] font-semibold uppercase tracking-wide text-slate-400 border-b border-slate-200 dark:border-slate-700">
              <th className="py-2 pr-2 w-16">Order</th>
              <th className="py-2 pr-2">Name</th>
              <th className="py-2 pr-2">Feed URL</th>
              <th className="py-2 pr-2 w-24">Format</th>
              <th className="py-2 pr-2">Description</th>
              <th className="py-2 w-10">
                <span className="sr-only">Remove</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {feeds.map((feed, i) => (
              <tr key={feed.id ?? `new-${i}`} className="border-b border-slate-100 dark:border-slate-700/50">
                <td className="py-1 pr-2">
                  <div className="flex gap-0.5">
                    <button type="button" onClick={() => move(i, -1)} disabled={i === 0} aria-label="Move up" className="p-1 text-slate-400 hover:text-indigo-600 disabled:opacity-30">
                      <i className="fa-solid fa-chevron-up text-[10px]" />
                    </button>
                    <button
                      type="button"
                      onClick={() => move(i, 1)}
                      disabled={i === feeds.length - 1}
                      aria-label="Move down"
                      className="p-1 text-slate-400 hover:text-indigo-600 disabled:opacity-30"
                    >
                      <i className="fa-solid fa-chevron-down text-[10px]" />
                    </button>
                  </div>
                </td>
                <td className="py-1 pr-2">
                  <input aria-label="Name" className={tblInputCls} value={feed.name} onChange={(e) => update(i, { name: e.target.value })} />
                </td>
                <td className="py-1 pr-2">
                  <input
                    aria-label="Feed URL"
                    className={tblInputCls}
                    placeholder="https://..."
                    value={feed.host}
                    onChange={(e) => update(i, { host: e.target.value })}
                  />
                </td>
                <td className="py-1 pr-2">
                  <select
                    aria-label="Feed format"
                    className={tblInputCls}
                    value={feed.tag}
                    onChange={(e) => update(i, { tag: e.target.value as "item" | "entry" })}
                  >
                    <option value="item">RSS</option>
                    <option value="entry">Atom</option>
                  </select>
                </td>
                <td className="py-1 pr-2">
                  <input
                    aria-label="Description"
                    className={tblInputCls}
                    value={feed.description ?? ""}
                    onChange={(e) => update(i, { description: e.target.value })}
                  />
                </td>
                <td className="py-1">
                  <button type="button" onClick={() => remove(i)} aria-label="Remove feed" className="p-1.5 text-red-400 hover:text-red-600">
                    <i className="fa fa-trash text-xs" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex items-center justify-between mt-2">
        <button
          type="button"
          onClick={addRow}
          disabled={feeds.length >= MAX_RSS_FEEDS}
          className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 flex items-center gap-1.5 disabled:opacity-40"
        >
          <i className="fa-solid fa-plus text-xs" /> Add Feed
        </button>
        <span className="text-xs text-slate-400">
          {feeds.length} / {MAX_RSS_FEEDS}
        </span>
      </div>
    </div>
  );
}
