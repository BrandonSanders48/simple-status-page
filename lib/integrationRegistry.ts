import { INTEGRATION_CATALOG_META } from "./integrationCatalogMeta";
import type { IntegrationCatalogEntry, IntegrationStatus } from "./integrations/types";
import { fetchUnifiStatus } from "./integrations/unifi";
import { fetchSophosCentralStatus } from "./integrations/sophosCentral";
import { fetchSophosXgsStatus } from "./integrations/sophosXgs";
import { fetchGotoConnectStatus } from "./integrations/gotoConnect";
import { fetchPowerstoreStatus, isPowerstoreAlertCritical, isMetroSessionHealthy } from "./integrations/powerstore";
import { fetchProxmoxStorageStatus } from "./integrations/proxmox";
import { fetchPbsStatus } from "./integrations/pbs";

/**
 * PowerStore/Proxmox/PBS's real status display (lib/storageCache.ts, lib/pbsCache.ts,
 * components/StorageSections.tsx) calls their bespoke fetch functions directly and
 * keeps their own rich types -- alert-acknowledge, Metro sessions, node capacity bars,
 * and backup task history don't fit the generic marketplace shape without a real
 * regression. These adapters exist only so the generic admin Test Connection button
 * (POST /api/admin/test-integration) works uniformly across every catalog entry,
 * including these three, without the client needing to special-case them.
 */
async function fetchPowerstoreForCatalog(config: Record<string, string>): Promise<IntegrationStatus> {
  const status = await fetchPowerstoreStatus({ host: config.host ?? "", username: config.username ?? "", password: config.password ?? "" });
  if (!status.ok) {
    return { ok: false, error: status.error ?? "Failed to connect to PowerStore", diagnostics: status.diagnostics, healthy: false, summary: "", items: [] };
  }
  const items = [
    ...status.alerts.map((a) => ({ label: a.description, value: a.severity, ok: !isPowerstoreAlertCritical(a.severity) })),
    ...status.metroSessions.map((m) => ({ label: m.name, value: m.state, ok: isMetroSessionHealthy(m.state) })),
  ];
  return {
    ok: true,
    diagnostics: status.diagnostics,
    healthy: items.every((i) => i.ok !== false),
    summary: `Cluster "${status.clusterName ?? "unknown"}" (${status.clusterState ?? "unknown state"}), ${status.alerts.length} active alert(s), ${status.metroSessions.length} Metro session(s).`,
    items,
  };
}

async function fetchProxmoxForCatalog(config: Record<string, string>): Promise<IntegrationStatus> {
  const status = await fetchProxmoxStorageStatus({
    host: config.host ?? "",
    tokenId: config.tokenId ?? "",
    tokenSecret: config.tokenSecret ?? "",
    storageId: config.storageId || null,
  });
  if (!status.ok) {
    return { ok: false, error: status.error ?? "Failed to connect to Proxmox", diagnostics: status.diagnostics, healthy: false, summary: "", items: [] };
  }
  const offlineNodes = status.nodes.filter((n) => !n.online).length;
  const items = [
    ...status.nodes.map((n) => ({ label: n.name, value: n.online ? "Online" : "Offline", ok: n.online })),
    ...status.storages.map((s) => ({ label: `${s.storage} (${s.node})`, value: s.active ? "Available" : "Unavailable", ok: s.active })),
  ];
  const quorumText = status.quorate === null ? "" : status.quorate ? ", quorate" : ", NO QUORUM";
  return {
    ok: true,
    diagnostics: status.diagnostics,
    healthy: status.quorate !== false && items.every((i) => i.ok !== false),
    summary: `${status.nodes.length} node(s)${quorumText}, ${offlineNodes} offline, ${status.storages.length} storage entr${status.storages.length === 1 ? "y" : "ies"}.`,
    items,
  };
}

async function fetchPbsForCatalog(config: Record<string, string>): Promise<IntegrationStatus> {
  const status = await fetchPbsStatus({ host: config.host ?? "", tokenId: config.tokenId ?? "", tokenSecret: config.tokenSecret ?? "" });
  if (!status.ok) {
    return {
      ok: false,
      error: status.error ?? "Failed to connect to Proxmox Backup Server",
      diagnostics: status.diagnostics,
      healthy: false,
      summary: "",
      items: [],
    };
  }
  return {
    ok: true,
    diagnostics: status.diagnostics,
    healthy: status.lastRunHealthy,
    summary: `Last run ${status.lastRunHealthy ? "OK" : "failed"}${status.lastRunAt ? ` at ${status.lastRunAt}` : ""}, ${status.tasks.length} task(s).`,
    items: status.tasks.map((t) => ({ label: t.id, value: t.status, ok: t.status === "OK" })),
  };
}

const FETCHERS: Record<string, IntegrationCatalogEntry["fetchStatus"]> = {
  powerstore: fetchPowerstoreForCatalog,
  proxmox: fetchProxmoxForCatalog,
  pbs: fetchPbsForCatalog,
  unifi: fetchUnifiStatus,
  sophos_central: fetchSophosCentralStatus,
  sophos_xgs: fetchSophosXgsStatus,
  goto_connect: fetchGotoConnectStatus,
};

/**
 * Server-side catalog: the client-safe metadata (lib/integrationCatalogMeta.ts) plus
 * each integration's fetch function, which pulls in undici/insecureAgent and must
 * never end up in a client bundle -- this file (and this file alone) joins the two,
 * so only server code (lib/integrationsCache.ts, the admin test-connection route)
 * should import from here.
 */
export const INTEGRATION_CATALOG: IntegrationCatalogEntry[] = INTEGRATION_CATALOG_META.map((meta) => ({
  ...meta,
  fetchStatus: FETCHERS[meta.key]!,
}));

export function getIntegrationCatalogEntry(key: string): IntegrationCatalogEntry | undefined {
  return INTEGRATION_CATALOG.find((e) => e.key === key);
}
