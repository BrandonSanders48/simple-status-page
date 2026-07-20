"use client";

import { useState } from "react";
import type { DraftIntegrationTarget } from "@/lib/adminTypes";
import { INTEGRATION_CATALOG_META, type IntegrationCatalogMeta } from "@/lib/integrationCatalogMeta";
import { IntegrationLogo } from "../IntegrationsSection";
import { inputCls, labelCls } from "./styles";

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

  // GoTo Connect authenticates with EITHER a Personal Access Token OR a Refresh
  // Token, never both -- showing both as plain fields alongside OAuth Client ID/
  // Secret reads as "needs 3 different credential types," so this swaps them for a
  // single toggle + one field instead (OAuth Client ID/Secret are still always
  // required either way, and render normally via the generic field grid below).
  const isGoto = entry.key === "goto_connect";
  const genericFields = isGoto ? entry.fields.filter((f) => f.key !== "personalAccessToken" && f.key !== "refreshToken") : entry.fields;
  // Real state, not derived from which field has content -- deriving it from
  // e.g. `refreshToken` being non-empty meant clicking "Refresh Token" while it was
  // still blank had nothing to make the radio actually reflect: the field would
  // stay empty, so the derived value snapped straight back to "pat" and the toggle
  // looked unclickable. Only the initial value (for an existing saved target) needs
  // to look at the config; after that, a click is the source of truth.
  const [gotoAuthMethod, setGotoAuthMethod] = useState<"pat" | "refresh">(() => (target.config.refreshToken ? "refresh" : "pat"));

  function selectGotoAuthMethod(method: "pat" | "refresh") {
    setGotoAuthMethod(method);
    onChange({ config: { ...target.config, [method === "pat" ? "refreshToken" : "personalAccessToken"]: "" } });
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
        {entry.supportsDr && (
          <label
            className="flex items-center gap-2 cursor-pointer text-xs whitespace-nowrap"
            title="Feeds the Failover tab's recommendation, and (for Proxmox) is the only cluster the Failover tab will let you start VMs on"
          >
            <input type="checkbox" checked={target.isDr} onChange={(e) => onChange({ isDr: e.target.checked })} className="w-4 h-4 accent-amber-600" />
            DR site
          </label>
        )}
        <button type="button" onClick={onRemove} aria-label="Remove target" className="p-1.5 text-red-400 hover:text-red-600">
          <i className="fa fa-trash text-xs" />
        </button>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {genericFields.map((f) => (
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
        {isGoto && (
          <div className="sm:col-span-2 space-y-2">
            <label className={labelCls}>Authentication Method</label>
            <div className="flex gap-4 text-xs text-slate-600 dark:text-slate-300">
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="radio"
                  name={`goto-auth-${index}`}
                  checked={gotoAuthMethod === "pat"}
                  onChange={() => selectGotoAuthMethod("pat")}
                  className="accent-indigo-600"
                />
                Personal Access Token
              </label>
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="radio"
                  name={`goto-auth-${index}`}
                  checked={gotoAuthMethod === "refresh"}
                  onChange={() => selectGotoAuthMethod("refresh")}
                  className="accent-indigo-600"
                />
                Refresh Token
              </label>
            </div>
            <input
              type="password"
              className={inputCls}
              value={(gotoAuthMethod === "pat" ? target.config.personalAccessToken : target.config.refreshToken) ?? ""}
              onChange={(e) => setField(gotoAuthMethod === "pat" ? "personalAccessToken" : "refreshToken", e.target.value)}
              placeholder={gotoAuthMethod === "pat" ? "Personal Access Token" : "Refresh Token"}
            />
          </div>
        )}
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
    onTargetsChange([...targets, { integration: entry.key, name: "", config, enabled: true, isDr: false, sortOrder: targets.length }]);
  }

  return (
    <div className="border border-slate-200 dark:border-slate-700 rounded-2xl p-5 space-y-4">
      <div className="flex items-start gap-3">
        <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-slate-100 dark:bg-slate-800 flex-shrink-0">
          <IntegrationLogo meta={entry} className="w-6 h-6" />
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
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100">Integrations Marketplace</h3>
        <p className="text-xs text-slate-400 mt-1">Connect additional systems to monitor on the public status page.</p>
      </div>
      <div className="space-y-4">
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
    </div>
  );
}
