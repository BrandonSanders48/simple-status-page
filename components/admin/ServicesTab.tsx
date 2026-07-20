"use client";

import type { DraftService } from "@/lib/adminTypes";
import { tblInputCls } from "./styles";

const MAX_SERVICES = 20;

export default function ServicesTab({
  services,
  onChange,
}: {
  services: DraftService[];
  onChange: (s: DraftService[]) => void;
}) {
  function update(index: number, patch: Partial<DraftService>) {
    const next = services.slice();
    next[index] = { ...next[index], ...patch } as DraftService;
    onChange(next);
  }

  function remove(index: number) {
    onChange(services.filter((_, i) => i !== index));
  }

  function move(index: number, dir: -1 | 1) {
    const target = index + dir;
    if (target < 0 || target >= services.length) return;
    const next = services.slice();
    const [item] = next.splice(index, 1);
    next.splice(target, 0, item!);
    onChange(next);
  }

  function addRow() {
    if (services.length >= MAX_SERVICES) return;
    onChange([
      ...services,
      {
        name: "",
        host: "",
        port: 80,
        type: "TCP",
        description: "",
        visible: true,
        sortOrder: services.length,
      },
    ]);
  }

  return (
    <div>
      <p className="text-xs text-slate-400 mb-3">
        Leave Port blank for ICMP ping. Type &quot;http&quot;/&quot;https&quot;/&quot;dns&quot; enables real protocol checks. Type &quot;ad&quot; checks a
        domain controller&apos;s core ports (DNS, Kerberos, LDAP/LDAPS, SMB, Global Catalog) and ignores Port.
      </p>
      <div className="overflow-x-auto border border-slate-100 dark:border-slate-800 rounded-xl px-3">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="text-[10.5px] font-semibold uppercase tracking-wide text-slate-400 border-b border-slate-200 dark:border-slate-700">
              <th className="py-2 pr-2 w-16">Order</th>
              <th className="py-2 pr-2">Name</th>
              <th className="py-2 pr-2">Host / IP</th>
              <th className="py-2 pr-2 w-20">Port</th>
              <th className="py-2 pr-2 w-24">Type</th>
              <th className="py-2 pr-2">Description</th>
              <th className="py-2 pr-2 w-14 text-center">Show</th>
              <th className="py-2 w-10"><span className="sr-only">Remove</span></th>
            </tr>
          </thead>
          <tbody>
            {services.map((svc, i) => (
              <tr key={svc.id ?? `new-${i}`} className="border-b border-slate-100 dark:border-slate-700/50">
                <td className="py-1 pr-2">
                  <div className="flex gap-0.5">
                    <button type="button" onClick={() => move(i, -1)} disabled={i === 0} aria-label="Move up" className="p-1 text-slate-400 hover:text-indigo-600 disabled:opacity-30">
                      <i className="fa-solid fa-chevron-up text-[10px]" />
                    </button>
                    <button type="button" onClick={() => move(i, 1)} disabled={i === services.length - 1} aria-label="Move down" className="p-1 text-slate-400 hover:text-indigo-600 disabled:opacity-30">
                      <i className="fa-solid fa-chevron-down text-[10px]" />
                    </button>
                  </div>
                </td>
                <td className="py-1 pr-2">
                  <input aria-label="Name" className={tblInputCls} value={svc.name} onChange={(e) => update(i, { name: e.target.value })} />
                </td>
                <td className="py-1 pr-2">
                  <input aria-label="Host or IP" className={tblInputCls} value={svc.host} onChange={(e) => update(i, { host: e.target.value })} />
                </td>
                <td className="py-1 pr-2">
                  <input
                    aria-label="Port"
                    className={`${tblInputCls} disabled:opacity-40`}
                    placeholder={svc.type.trim().toLowerCase() === "ad" ? "n/a" : "ping"}
                    disabled={svc.type.trim().toLowerCase() === "ad"}
                    value={svc.port ?? ""}
                    onChange={(e) => update(i, { port: e.target.value === "" ? null : Number(e.target.value) })}
                  />
                </td>
                <td className="py-1 pr-2">
                  <input aria-label="Type" className={tblInputCls} value={svc.type} onChange={(e) => update(i, { type: e.target.value })} />
                </td>
                <td className="py-1 pr-2">
                  <input
                    aria-label="Description"
                    className={tblInputCls}
                    value={svc.description ?? ""}
                    onChange={(e) => update(i, { description: e.target.value })}
                  />
                </td>
                <td className="py-1 pr-2 text-center">
                  <input
                    type="checkbox"
                    aria-label="Visible on status page"
                    checked={svc.visible}
                    onChange={(e) => update(i, { visible: e.target.checked })}
                    className="w-4 h-4 accent-indigo-600"
                  />
                </td>
                <td className="py-1">
                  <button type="button" onClick={() => remove(i)} aria-label="Remove service" className="p-1.5 text-red-400 hover:text-red-600">
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
          disabled={services.length >= MAX_SERVICES}
          className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 flex items-center gap-1.5 disabled:opacity-40"
        >
          <i className="fa-solid fa-plus text-xs" /> Add Service
        </button>
        <span className="text-xs text-slate-400">
          {services.length} / {MAX_SERVICES}
        </span>
      </div>
    </div>
  );
}
