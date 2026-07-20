"use client";

import { useState } from "react";
import type { DraftIntegrationTarget } from "@/lib/adminTypes";
import { INTEGRATION_CATALOG_META, type IntegrationCatalogMeta } from "@/lib/integrationCatalogMeta";
import { inputCls, labelCls } from "./styles";
import { SettingsGroup } from "./SettingsGroup";

const MAX_TARGETS_PER_INTEGRATION = 5;

function IntegrationTargetCard({
  entry,
  target,
  index,
  csrfToken,
  onChange,
  onRemove,
}: {
  entry: IntegrationCatalogMeta;
  target: DraftIntegrationTarget;
  index: number;
  csrfToken: string;
  onChange: (patch: Partial<DraftIntegrationTarget>) => void;
  onRemove: () => void;
}) {
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);

  function setField(key: string, value: string) {
    onChange({ config: { ...target.config, [key]: value } });
  }

  async function test() {
    setTesting(true);
    setResult(null);
    try {
      const res = await fetch("/api/admin/test-integration", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-CSRF-Token": csrfToken },
        body: JSON.stringify({ integration: entry.key, config: target.config }),
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
          placeholder={`e.g. Main Office ${entry.label}`}
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
        {entry.fields.map((f) => (
          <div key={f.key}>
            <label htmlFor={`${entry.key}-${f.key}-${index}`} className={labelCls}>
              {f.label}
            </label>
            <input
              id={`${entry.key}-${f.key}-${index}`}
              type={f.type}
              className={inputCls}
              value={target.config[f.key] ?? ""}
              onChange={(e) => setField(f.key, e.target.value)}
              placeholder={f.placeholder}
            />
          </div>
        ))}
      </div>
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={test}
          disabled={testing}
          className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg whitespace-nowrap disabled:opacity-60"
        >
          <i className="fa-solid fa-plug text-xs mr-1.5" /> {testing ? "Testing..." : "Test Connection"}
        </button>
        {result && <p className={`text-xs ${result.ok ? "text-emerald-600" : "text-red-500"}`}>{result.text}</p>}
      </div>
    </div>
  );
}

function IntegrationCatalogCard({
  entry,
  targets,
  csrfToken,
  onTargetsChange,
}: {
  entry: IntegrationCatalogMeta;
  targets: DraftIntegrationTarget[];
  csrfToken: string;
  onTargetsChange: (t: DraftIntegrationTarget[]) => void;
}) {
  function update(index: number, patch: Partial<DraftIntegrationTarget>) {
    const next = targets.slice();
    next[index] = { ...next[index], ...patch } as DraftIntegrationTarget;
    onTargetsChange(next);
  }

  function add() {
    if (targets.length >= MAX_TARGETS_PER_INTEGRATION) return;
    const config = Object.fromEntries(entry.fields.map((f) => [f.key, ""]));
    onTargetsChange([...targets, { integration: entry.key, name: "", config, enabled: true, sortOrder: targets.length }]);
  }

  return (
    <div className="border border-slate-200 dark:border-slate-700 rounded-2xl p-5 space-y-4">
      <div className="flex items-start gap-3">
        <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-slate-100 dark:bg-slate-800 flex-shrink-0">
          <i className={`fa-solid ${entry.icon} ${entry.color}`} />
        </div>
        <div className="flex-1">
          <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">{entry.label}</p>
          <p className="text-xs text-slate-400 mt-0.5">{entry.description}</p>
        </div>
      </div>

      {targets.length > 0 && (
        <div className="space-y-3">
          {targets.map((t, i) => (
            <IntegrationTargetCard
              key={t.id ?? `new-${entry.key}-${i}`}
              entry={entry}
              target={t}
              index={i}
              csrfToken={csrfToken}
              onChange={(patch) => update(i, patch)}
              onRemove={() => onTargetsChange(targets.filter((_, idx) => idx !== i))}
            />
          ))}
        </div>
      )}

      <button
        type="button"
        onClick={add}
        disabled={targets.length >= MAX_TARGETS_PER_INTEGRATION}
        className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 flex items-center gap-1.5 disabled:opacity-40"
      >
        <i className="fa-solid fa-plus text-xs" /> Add {entry.label}
      </button>
    </div>
  );
}

/**
 * The integrations marketplace: one card per catalog entry (see
 * lib/integrationCatalogMeta.ts), each holding its own configured targets. Adding a
 * new integration to the catalog automatically gets a card here and a generic
 * form driven by that entry's field list -- no new admin UI code needed per integration.
 */
export default function IntegrationsTab({
  integrationTargets,
  onIntegrationTargetsChange,
  csrfToken,
}: {
  integrationTargets: DraftIntegrationTarget[];
  onIntegrationTargetsChange: (t: DraftIntegrationTarget[]) => void;
  csrfToken: string;
}) {
  return (
    <div>
      <SettingsGroup title="Integrations Marketplace" description="Connect additional systems to monitor on the public status page." wide>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {INTEGRATION_CATALOG_META.map((entry) => (
            <IntegrationCatalogCard
              key={entry.key}
              entry={entry}
              targets={integrationTargets.filter((t) => t.integration === entry.key)}
              csrfToken={csrfToken}
              onTargetsChange={(updated) => {
                const others = integrationTargets.filter((t) => t.integration !== entry.key);
                onIntegrationTargetsChange([...others, ...updated]);
              }}
            />
          ))}
        </div>
      </SettingsGroup>
    </div>
  );
}
