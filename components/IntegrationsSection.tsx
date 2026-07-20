"use client";

import { useState } from "react";
import type { IntegrationStatus } from "@/lib/integrations/types";
import { getIntegrationCatalogMeta, type IntegrationCatalogMeta } from "@/lib/integrationCatalogMeta";

/** Real brand logo when the catalog entry has one, falling back to the generic
 * FontAwesome icon otherwise -- shared by the public card and the admin marketplace. */
export function IntegrationLogo({ meta, className = "w-5 h-5" }: { meta: IntegrationCatalogMeta; className?: string }) {
  if (meta.logo) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={meta.logo} alt={meta.label} className={`${className} object-contain`} />;
  }
  return <i className={`fa-solid ${meta.icon} ${meta.color}`} />;
}

/** Same as IntegrationStatus.items' row shape, plus whether an admin has ignored it
 * (computed server-side in lib/integrationsCache.ts, not by the integration itself). */
export interface IntegrationItemPayload {
  label: string;
  value: string;
  ok: boolean | null;
  key: string;
  ignored: boolean;
}

export interface IntegrationStatusPayload extends Omit<IntegrationStatus, "items"> {
  items: IntegrationItemPayload[];
}

export interface IntegrationTargetPayload {
  id: number;
  integration: string;
  name: string;
  status: IntegrationStatusPayload;
}

export interface IntegrationsPayload {
  enabled: boolean;
  targets: IntegrationTargetPayload[];
}

export function isIntegrationHealthy(status: IntegrationStatusPayload): boolean {
  return status.ok && status.healthy;
}

/** True unless marketplace integrations are enabled and something they're watching is
 * unhealthy -- same "invisible when off" fold-in as isStorageHealthy/isPbsAllHealthy.
 * Skips any target whose catalog entry has `affectsOverallStatus: false` (currently
 * just sophos_central) -- its card still shows its own Healthy/Attention state, it
 * just doesn't flip the site-wide banner, since a security/posture alert isn't the
 * same thing as a service actually being down. */
export function isIntegrationsAllHealthy(payload: IntegrationsPayload | null): boolean {
  if (!payload?.enabled) return true;
  return payload.targets.every((t) => getIntegrationCatalogMeta(t.integration)?.affectsOverallStatus === false || isIntegrationHealthy(t.status));
}

/** `ok: null` renders neutral grey -- "no definitive reading" (not configured/used,
 * or unconfirmed), distinct from both healthy (green) and unhealthy (red). */
function Pill({ ok, label }: { ok: boolean | null; label: string }) {
  const cls =
    ok === null
      ? "bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400"
      : ok
        ? "bg-emerald-50 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300"
        : "bg-red-50 dark:bg-red-500/20 text-red-700 dark:text-red-300";
  return <span className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-semibold ${cls}`}>{label}</span>;
}

function ExpandChevron({ expanded }: { expanded: boolean }) {
  return <i className={`fa-solid fa-chevron-down text-xs text-slate-400 transition-transform ${expanded ? "rotate-180" : ""}`} />;
}

/**
 * One card per configured marketplace target -- fully generic (no per-integration
 * display code) off the IntegrationStatus shape every catalog entry's fetch function
 * returns, so a new integration in lib/integrationCatalogMeta.ts never needs a new
 * component here. Admins can "Ignore" any individual alerting row (e.g. a device
 * that's expected to be offline) -- it stays visible, dimmed, and stops counting
 * toward this card's healthy rollup until un-ignored.
 */
export function IntegrationCard({
  targetId,
  integration,
  name,
  status,
  isAdmin = false,
  csrfToken,
  onIgnoreChanged,
}: {
  targetId: number;
  integration: string;
  name: string;
  status: IntegrationStatusPayload;
  isAdmin?: boolean;
  csrfToken?: string;
  onIgnoreChanged?: () => void;
}) {
  const meta = getIntegrationCatalogMeta(integration);
  // Overview by default -- expanded automatically when unhealthy, otherwise collapsed
  // to just the summary line.
  const [expanded, setExpanded] = useState(!status.healthy);
  const [togglingKey, setTogglingKey] = useState<string | null>(null);

  async function toggleIgnore(itemKey: string, ignored: boolean) {
    if (!csrfToken) return;
    setTogglingKey(itemKey);
    try {
      await fetch("/api/admin/integration-ignore", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-CSRF-Token": csrfToken },
        body: JSON.stringify({ targetId, itemKey, ignored }),
      });
      onIgnoreChanged?.();
    } catch {
      // Swallow -- the item simply keeps its old ignore state, and the admin can retry.
    } finally {
      setTogglingKey(null);
    }
  }

  if (!status.ok) {
    return (
      <div>
        <div className="flex items-center gap-2 mb-1">
          {meta && <IntegrationLogo meta={meta} />}
          <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">{name}</p>
        </div>
        <p className="text-sm text-red-500">
          Unable to connect{meta ? ` to ${meta.label}` : ""}: {status.error ?? "unknown error"}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <button
        type="button"
        onClick={() => setExpanded((e) => !e)}
        aria-expanded={expanded}
        className="w-full flex flex-wrap items-center gap-2 text-left"
        disabled={status.items.length === 0}
      >
        {meta && <IntegrationLogo meta={meta} />}
        <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">{name}</span>
        {meta && <span className="text-xs text-slate-400">{meta.label}</span>}
        <Pill ok={status.healthy} label={status.healthy ? "Healthy" : "Attention"} />
        <span className="text-xs text-slate-400 ml-auto">{status.summary}</span>
        {status.items.length > 0 && <ExpandChevron expanded={expanded} />}
      </button>
      {expanded && status.items.length > 0 && (
        <ul className="space-y-1">
          {status.items.map((item) => (
            <li
              key={item.key}
              className={`text-sm flex items-center gap-2 ${item.ignored ? "opacity-50" : "text-slate-600 dark:text-slate-300"}`}
            >
              <Pill ok={item.ignored ? null : item.ok} label={item.ignored ? `${item.value} (ignored)` : item.value} />
              <span className="flex-1">{item.label}</span>
              {isAdmin && item.ok === false && (
                <button
                  type="button"
                  onClick={() => toggleIgnore(item.key, !item.ignored)}
                  disabled={togglingKey === item.key}
                  className="text-xs font-medium text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 disabled:opacity-50 whitespace-nowrap"
                >
                  {togglingKey === item.key ? "Saving..." : item.ignored ? "Unignore" : "Ignore"}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
