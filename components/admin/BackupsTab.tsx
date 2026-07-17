"use client";

import { useState } from "react";
import type { DraftPbsTarget } from "@/lib/adminTypes";
import { inputCls, labelCls } from "./styles";
import { SettingsGroup } from "./SettingsGroup";

const MAX_TARGETS = 10;

function PbsTargetCard({
  target,
  index,
  csrfToken,
  onChange,
  onRemove,
}: {
  target: DraftPbsTarget;
  index: number;
  csrfToken: string;
  onChange: (patch: Partial<DraftPbsTarget>) => void;
  onRemove: () => void;
}) {
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);

  async function test() {
    setTesting(true);
    setResult(null);
    try {
      const res = await fetch("/api/admin/test-pbs", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-CSRF-Token": csrfToken },
        body: JSON.stringify({ host: target.host, tokenId: target.tokenId, tokenSecret: target.tokenSecret }),
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
          placeholder="e.g. Main Site"
        />
        <label className="flex items-center gap-2 cursor-pointer text-xs whitespace-nowrap">
          <input type="checkbox" checked={target.enabled} onChange={(e) => onChange({ enabled: e.target.checked })} className="w-4 h-4 accent-indigo-600" />
          Enabled
        </label>
        <button type="button" onClick={onRemove} aria-label="Remove target" className="p-1.5 text-red-400 hover:text-red-600">
          <i className="fa fa-trash text-xs" />
        </button>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label htmlFor={`pbs-host-${index}`} className={labelCls}>API Host</label>
          <input id={`pbs-host-${index}`} className={inputCls} value={target.host} onChange={(e) => onChange({ host: e.target.value })} placeholder="https://10.0.0.30:8007" />
        </div>
        <div>
          <label htmlFor={`pbs-token-id-${index}`} className={labelCls}>API Token ID</label>
          <input
            id={`pbs-token-id-${index}`}
            className={inputCls}
            value={target.tokenId}
            onChange={(e) => onChange({ tokenId: e.target.value })}
            placeholder="statuspage@pbs!monitor"
          />
        </div>
        <div className="sm:col-span-2">
          <label htmlFor={`pbs-token-secret-${index}`} className={labelCls}>API Token Secret</label>
          <input
            id={`pbs-token-secret-${index}`}
            type="password"
            className={inputCls}
            value={target.tokenSecret}
            onChange={(e) => onChange({ tokenSecret: e.target.value })}
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

export default function BackupsTab({
  pbsTargets,
  onPbsTargetsChange,
  csrfToken,
}: {
  pbsTargets: DraftPbsTarget[];
  onPbsTargetsChange: (t: DraftPbsTarget[]) => void;
  csrfToken: string;
}) {
  function updatePbs(index: number, patch: Partial<DraftPbsTarget>) {
    const next = pbsTargets.slice();
    next[index] = { ...next[index], ...patch } as DraftPbsTarget;
    onPbsTargetsChange(next);
  }

  function addPbs() {
    if (pbsTargets.length >= MAX_TARGETS) return;
    onPbsTargetsChange([
      ...pbsTargets,
      { name: "", host: "", tokenId: "", tokenSecret: "", enabled: true, sortOrder: pbsTargets.length },
    ]);
  }

  return (
    <div>
      <SettingsGroup
        title="Proxmox Backup Server"
        description="API endpoint and token for each PBS instance, used to check whether the most recent backup run completed without errors. Add one target per instance -- e.g. a main site and a DR site."
        wide
      >
        <div className="space-y-4">
          {pbsTargets.map((t, i) => (
            <PbsTargetCard
              key={t.id ?? `new-pbs-${i}`}
              target={t}
              index={i}
              csrfToken={csrfToken}
              onChange={(patch) => updatePbs(i, patch)}
              onRemove={() => onPbsTargetsChange(pbsTargets.filter((_, idx) => idx !== i))}
            />
          ))}
        </div>
        <button
          type="button"
          onClick={addPbs}
          disabled={pbsTargets.length >= MAX_TARGETS}
          className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 flex items-center gap-1.5 disabled:opacity-40"
        >
          <i className="fa-solid fa-plus text-xs" /> Add PBS Instance
        </button>
      </SettingsGroup>
    </div>
  );
}
