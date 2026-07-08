"use client";

import type { SettingsRow, IspMapRow } from "@/lib/adminTypes";
import { inputCls, labelCls, tblInputCls } from "./styles";
import { SettingsGroup } from "./SettingsGroup";

export default function NetworkTab({
  settings,
  onChange,
  ispMap,
  onIspChange,
}: {
  settings: SettingsRow;
  onChange: (s: SettingsRow) => void;
  ispMap: IspMapRow[];
  onIspChange: (m: IspMapRow[]) => void;
}) {
  function set<K extends keyof SettingsRow>(key: K, value: SettingsRow[K]) {
    onChange({ ...settings, [key]: value });
  }

  function updateIsp(index: number, patch: Partial<IspMapRow>) {
    const next = ispMap.slice();
    next[index] = { ...next[index], ...patch } as IspMapRow;
    onIspChange(next);
  }

  function removeIsp(index: number) {
    onIspChange(ispMap.filter((_, i) => i !== index));
  }

  function addIsp() {
    onIspChange([...ispMap, { ip: "", name: "" }]);
  }

  return (
    <div>
      <SettingsGroup title="Connectivity Checks" description="Used to compute the Local-Area and Wide-Area status rows on the public page.">
        <div>
          <label htmlFor="cfg-gateway" className={labelCls}>Default Gateway</label>
          <input id="cfg-gateway" className={inputCls} value={settings.gatewayHost ?? ""} onChange={(e) => set("gatewayHost", e.target.value)} placeholder="192.168.1.1" />
          <p className="text-xs text-slate-400 mt-1">Checked via ICMP ping for Local-Area status.</p>
        </div>
        <div>
          <label htmlFor="cfg-public-dns" className={labelCls}>Public DNS Server</label>
          <input id="cfg-public-dns" className={inputCls} value={settings.publicDnsHost ?? ""} onChange={(e) => set("publicDnsHost", e.target.value)} placeholder="8.8.8.8" />
          <p className="text-xs text-slate-400 mt-1">Checked with a real DNS query for Wide-Area status.</p>
        </div>
        <div>
          <label htmlFor="cfg-domain" className={labelCls}>Internal Domain</label>
          <input id="cfg-domain" className={inputCls} value={settings.internalDomain ?? ""} onChange={(e) => set("internalDomain", e.target.value)} placeholder="corp.local" />
        </div>
      </SettingsGroup>

      <SettingsGroup title="ISP Detection Map" description="Maps your public IP address to a friendly ISP name shown alongside Wide-Area status." wide>
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="text-[10.5px] font-semibold uppercase tracking-wide text-slate-400 border-b border-slate-200 dark:border-slate-700">
              <th className="py-2 pr-2">Public IP</th>
              <th className="py-2 pr-2">ISP Label</th>
              <th className="py-2 w-10">
                <span className="sr-only">Remove</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {ispMap.map((entry, i) => (
              <tr key={i} className="border-b border-slate-100 dark:border-slate-700/50">
                <td className="py-1 pr-2">
                  <input aria-label="Public IP" className={tblInputCls} placeholder="1.2.3.4" value={entry.ip} onChange={(e) => updateIsp(i, { ip: e.target.value })} />
                </td>
                <td className="py-1 pr-2">
                  <input aria-label="ISP name" className={tblInputCls} placeholder="ISP Name" value={entry.name} onChange={(e) => updateIsp(i, { name: e.target.value })} />
                </td>
                <td className="py-1">
                  <button type="button" onClick={() => removeIsp(i)} aria-label="Remove entry" className="p-1.5 text-red-400 hover:text-red-600">
                    <i className="fa fa-trash text-xs" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <button type="button" onClick={addIsp} className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 flex items-center gap-1.5 mt-2">
          <i className="fa-solid fa-plus text-xs" /> Add ISP
        </button>
      </SettingsGroup>
    </div>
  );
}
