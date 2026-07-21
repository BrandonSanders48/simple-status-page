"use client";

import type { DraftSite, SettingsRow } from "@/lib/adminTypes";
import { tblInputCls } from "./styles";
import { SettingsGroup } from "./SettingsGroup";

const MAX_SITES = 20;

export default function SitesTab({
  sites,
  onChange,
  settings,
  onSettingsChange,
}: {
  sites: DraftSite[];
  onChange: (s: DraftSite[]) => void;
  settings: SettingsRow;
  onSettingsChange: (s: SettingsRow) => void;
}) {
  function update(index: number, patch: Partial<DraftSite>) {
    const next = sites.slice();
    next[index] = { ...next[index], ...patch } as DraftSite;
    onChange(next);
  }

  function remove(index: number) {
    onChange(sites.filter((_, i) => i !== index));
  }

  function move(index: number, dir: -1 | 1) {
    const target = index + dir;
    if (target < 0 || target >= sites.length) return;
    const next = sites.slice();
    const [item] = next.splice(index, 1);
    next.splice(target, 0, item!);
    onChange(next);
  }

  function addRow() {
    if (sites.length >= MAX_SITES) return;
    onChange([...sites, { name: "", tunnelHost: "", tunnelPort: null, sortOrder: sites.length }]);
  }

  return (
    <div>
      <SettingsGroup title="Public Page Display" description="Controls how sites and their services appear on the status page itself.">
        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={settings.groupServicesBySite}
            onChange={(e) => onSettingsChange({ ...settings, groupServicesBySite: e.target.checked })}
            className="w-4 h-4 accent-indigo-600"
          />
          <span className="text-sm font-medium">
            Group services by site
            <span className="block text-xs text-slate-400 font-normal">
              Uncheck to keep every service in one flat view, same as before Sites existed -- Sites still work as an admin-only
              organizational tool and their tunnel checks still run, they just won&apos;t change what visitors see.
            </span>
          </span>
        </label>
      </SettingsGroup>

      <p className="text-xs text-slate-400 mb-3">
        A site groups Services under it (assign one in the Services section below) and, optionally, tests its own tunnel/link health
        independently of any of them -- so the status page can tell &quot;this whole site&apos;s tunnel is down&quot; apart from &quot;just
        one service happens to be down&quot;. Tunnel Host should be something only reachable through that site&apos;s link (its far-side
        gateway, a switch, etc), not any of the services themselves. Leave Tunnel Host blank to just group services with no tunnel check.
      </p>
      <div className="overflow-x-auto border border-slate-100 dark:border-slate-800 rounded-xl px-3">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="text-[10.5px] font-semibold uppercase tracking-wide text-slate-400 border-b border-slate-200 dark:border-slate-700">
              <th className="py-2 pr-2 w-16">Order</th>
              <th className="py-2 pr-2">Name</th>
              <th className="py-2 pr-2">Tunnel Host</th>
              <th className="py-2 pr-2 w-24">Tunnel Port</th>
              <th className="py-2 w-10"><span className="sr-only">Remove</span></th>
            </tr>
          </thead>
          <tbody>
            {sites.map((site, i) => (
              <tr key={site.id ?? `new-${i}`} className="border-b border-slate-100 dark:border-slate-700/50">
                <td className="py-1 pr-2">
                  <div className="flex gap-0.5">
                    <button type="button" onClick={() => move(i, -1)} disabled={i === 0} aria-label="Move up" className="p-1 text-slate-400 hover:text-indigo-600 disabled:opacity-30">
                      <i className="fa-solid fa-chevron-up text-[10px]" />
                    </button>
                    <button type="button" onClick={() => move(i, 1)} disabled={i === sites.length - 1} aria-label="Move down" className="p-1 text-slate-400 hover:text-indigo-600 disabled:opacity-30">
                      <i className="fa-solid fa-chevron-down text-[10px]" />
                    </button>
                  </div>
                </td>
                <td className="py-1 pr-2">
                  <input aria-label="Site name" className={tblInputCls} value={site.name} onChange={(e) => update(i, { name: e.target.value })} />
                </td>
                <td className="py-1 pr-2">
                  <input
                    aria-label="Tunnel host"
                    className={tblInputCls}
                    placeholder="e.g. 10.1.0.1"
                    value={site.tunnelHost ?? ""}
                    onChange={(e) => update(i, { tunnelHost: e.target.value === "" ? null : e.target.value })}
                  />
                </td>
                <td className="py-1 pr-2">
                  <input
                    aria-label="Tunnel port"
                    className={tblInputCls}
                    placeholder="ping"
                    value={site.tunnelPort ?? ""}
                    onChange={(e) => update(i, { tunnelPort: e.target.value === "" ? null : Number(e.target.value) })}
                  />
                </td>
                <td className="py-1">
                  <button type="button" onClick={() => remove(i)} aria-label="Remove site" className="p-1.5 text-red-400 hover:text-red-600">
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
          disabled={sites.length >= MAX_SITES}
          className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 flex items-center gap-1.5 disabled:opacity-40"
        >
          <i className="fa-solid fa-plus text-xs" /> Add Site
        </button>
        <span className="text-xs text-slate-400">
          {sites.length} / {MAX_SITES}
        </span>
      </div>
    </div>
  );
}
