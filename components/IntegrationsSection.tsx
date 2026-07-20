import type { IntegrationStatus } from "@/lib/integrations/types";
import { getIntegrationCatalogMeta } from "@/lib/integrationCatalogMeta";

export interface IntegrationTargetPayload {
  id: number;
  integration: string;
  name: string;
  status: IntegrationStatus;
}

export interface IntegrationsPayload {
  enabled: boolean;
  targets: IntegrationTargetPayload[];
}

export function isIntegrationHealthy(status: IntegrationStatus): boolean {
  return status.ok && status.healthy;
}

/** True unless marketplace integrations are enabled and something they're watching is
 * unhealthy -- same "invisible when off" fold-in as isStorageHealthy/isPbsAllHealthy. */
export function isIntegrationsAllHealthy(payload: IntegrationsPayload | null): boolean {
  if (!payload?.enabled) return true;
  return payload.targets.every((t) => isIntegrationHealthy(t.status));
}

function Pill({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span
      className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-semibold ${
        ok ? "bg-emerald-50 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300" : "bg-red-50 dark:bg-red-500/20 text-red-700 dark:text-red-300"
      }`}
    >
      {label}
    </span>
  );
}

/**
 * One card per configured marketplace target -- fully generic (no per-integration
 * display code) off the IntegrationStatus shape every catalog entry's fetch function
 * returns, so a new integration in lib/integrationCatalogMeta.ts never needs a new
 * component here.
 */
export function IntegrationCard({ integration, name, status }: { integration: string; name: string; status: IntegrationStatus }) {
  const meta = getIntegrationCatalogMeta(integration);

  if (!status.ok) {
    return (
      <div>
        <p className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-1">{name}</p>
        <p className="text-sm text-red-500">
          Unable to connect{meta ? ` to ${meta.label}` : ""}: {status.error ?? "unknown error"}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {meta && <i className={`fa-solid ${meta.icon} ${meta.color}`} />}
        <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">{name}</span>
        <Pill ok={status.healthy} label={status.healthy ? "Healthy" : "Attention"} />
      </div>
      <p className="text-sm text-slate-500 dark:text-slate-400">{status.summary}</p>
      {status.items.length > 0 && (
        <ul className="space-y-1">
          {status.items.map((item, i) => (
            <li key={i} className="text-sm text-slate-600 dark:text-slate-300 flex items-center gap-2">
              <Pill ok={item.ok} label={item.value} />
              <span>{item.label}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
