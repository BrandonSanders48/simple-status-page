"use client";

import { useState } from "react";
import type { DraftPowerstoreTarget } from "@/lib/adminTypes";
import { inputCls, labelCls } from "./styles";
import { SettingsGroup } from "./SettingsGroup";

const MAX_TARGETS = 10;

function PowerstoreTargetCard({
  target,
  index,
  csrfToken,
  onChange,
  onRemove,
}: {
  target: DraftPowerstoreTarget;
  index: number;
  csrfToken: string;
  onChange: (patch: Partial<DraftPowerstoreTarget>) => void;
  onRemove: () => void;
}) {
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);

  async function test() {
    setTesting(true);
    setResult(null);
    try {
      const res = await fetch("/api/admin/test-storage", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-CSRF-Token": csrfToken },
        body: JSON.stringify({ target: "powerstore", host: target.host, username: target.username, password: target.password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Connection test failed.");
      setResult({ ok: true, text: data.summary || "Connected successfully." });
    } catch (err) {
      setResult({ ok: false, text: err instanceof Error ? err.message : "Connection test failed." });
    } finally {
      setTesting(false);
    }
  }

  return (
    <div className="border border-slate-200 dark:border-slate-700 rounded-xl p-4 space-y-3">
      <div className="flex items-center gap-3">
        <input
          aria-label="Target name"
          className={`${inputCls} flex-1 font-semibold`}
          value={target.name}
          onChange={(e) => onChange({ name: e.target.value })}
          placeholder={`e.g. Main Site`}
        />
        <label className="flex items-center gap-2 cursor-pointer text-xs whitespace-nowrap">
          <input type="checkbox" checked={target.enabled} onChange={(e) => onChange({ enabled: e.target.checked })} className="w-4 h-4 accent-indigo-600" />
          Enabled
        </label>
        <label className="flex items-center gap-2 cursor-pointer text-xs whitespace-nowrap" title="Feeds the Failover tab's fail-over recommendation">
          <input type="checkbox" checked={target.isDr} onChange={(e) => onChange({ isDr: e.target.checked })} className="w-4 h-4 accent-amber-600" />
          DR site
        </label>
        <button type="button" onClick={onRemove} aria-label="Remove target" className="p-1.5 text-red-400 hover:text-red-600">
          <i className="fa fa-trash text-xs" />
        </button>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label htmlFor={`ps-host-${index}`} className={labelCls}>Management Host</label>
          <input id={`ps-host-${index}`} className={inputCls} value={target.host} onChange={(e) => onChange({ host: e.target.value })} placeholder="10.0.0.10" />
        </div>
        <div>
          <label htmlFor={`ps-user-${index}`} className={labelCls}>Username</label>
          <input id={`ps-user-${index}`} className={inputCls} value={target.username} onChange={(e) => onChange({ username: e.target.value })} />
        </div>
        <div className="sm:col-span-2">
          <label htmlFor={`ps-pass-${index}`} className={labelCls}>Password</label>
          <input
            id={`ps-pass-${index}`}
            type="password"
            className={inputCls}
            value={target.password}
            onChange={(e) => onChange({ password: e.target.value })}
            placeholder="********"
          />
        </div>
      </div>
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={test}
          disabled={testing || !target.host}
          className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg whitespace-nowrap disabled:opacity-60"
        >
          <i className="fa-solid fa-plug text-xs mr-1.5" /> {testing ? "Testing..." : "Test Connection"}
        </button>
        {result && <p className={`text-xs ${result.ok ? "text-emerald-600" : "text-red-500"}`}>{result.text}</p>}
      </div>
    </div>
  );
}

export default function StorageTab({
  powerstoreTargets,
  onPowerstoreTargetsChange,
  csrfToken,
}: {
  powerstoreTargets: DraftPowerstoreTarget[];
  onPowerstoreTargetsChange: (t: DraftPowerstoreTarget[]) => void;
  csrfToken: string;
}) {
  function updatePowerstore(index: number, patch: Partial<DraftPowerstoreTarget>) {
    const next = powerstoreTargets.slice();
    next[index] = { ...next[index], ...patch } as DraftPowerstoreTarget;
    onPowerstoreTargetsChange(next);
  }

  function addPowerstore() {
    if (powerstoreTargets.length >= MAX_TARGETS) return;
    onPowerstoreTargetsChange([
      ...powerstoreTargets,
      { name: "", host: "", username: "", password: "", enabled: true, isDr: false, sortOrder: powerstoreTargets.length },
    ]);
  }

  return (
    <div>
      <SettingsGroup
        title="Dell PowerStore"
        description="Management IP/hostname and a read-only account for each array's REST API. Shows a dedicated panel on the public status page with health/Metro replication status. Add one target per array -- e.g. a main site and a DR site."
        wide
      >
        <div className="space-y-4">
          {powerstoreTargets.map((t, i) => (
            <PowerstoreTargetCard
              key={t.id ?? `new-ps-${i}`}
              target={t}
              index={i}
              csrfToken={csrfToken}
              onChange={(patch) => updatePowerstore(i, patch)}
              onRemove={() => onPowerstoreTargetsChange(powerstoreTargets.filter((_, idx) => idx !== i))}
            />
          ))}
        </div>
        <button
          type="button"
          onClick={addPowerstore}
          disabled={powerstoreTargets.length >= MAX_TARGETS}
          className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 flex items-center gap-1.5 disabled:opacity-40"
        >
          <i className="fa-solid fa-plus text-xs" /> Add PowerStore Array
        </button>
      </SettingsGroup>
    </div>
  );
}
