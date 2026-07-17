import { isPowerstoreHealthy, isProxmoxHealthy, isCriticalSeverity, type StoragePayload } from "@/components/StorageSections";

export type FailoverRecommendation = "healthy" | "recommend" | "caution" | "unconfigured";

export interface FailoverStatus {
  recommendation: FailoverRecommendation;
  hasDr: boolean;
  primaryHealthy: boolean;
  drHealthy: boolean;
}

export interface FailoverServiceLike {
  up: boolean;
}

/** Confirmed against a live array: PowerStore reports a Metro session's role as
 * exactly "Metro_Preferred" or "Metro_Non_Preferred". */
function roleIndicatesPreferred(role?: string): boolean {
  return role?.toLowerCase() === "metro_preferred";
}

/**
 * True once a DR-flagged PowerStore array's Metro session reports itself as
 * "preferred" -- PowerStore's own Metro arbitration only shifts preference to the
 * non-original side when it has detected a real problem with the other one, so this
 * is treated as confirmation of an actual storage-level failover having occurred (not
 * just a recommendation), strong enough to flip the whole site to "not operational"
 * (see isDashboardDown in Dashboard.tsx) rather than just flagging the Failover tab.
 */
export function isDrPreferred(storage: StoragePayload | null): boolean {
  if (!storage?.enabled) return false;
  return storage.powerstores.some((t) => t.isDr && t.status.metroSessions.some((m) => roleIndicatesPreferred(m.role)));
}

/**
 * Compares the primary site's health against whichever targets are flagged as the DR
 * site, using data already fetched for the Services/Storage/Proxmox tabs -- no
 * separate polling needed. "recommend" only fires when the primary site looks down
 * AND the DR site looks ready; if both look bad this deliberately stops short of
 * recommending a failover into another bad environment.
 *
 * The primary site is only considered "down" for this purpose by specific, narrow
 * signals: most internal services being down, a primary Proxmox host being
 * unreachable/offline, a primary PowerStore array being unreachable or reporting a
 * critical alert, or a DR PowerStore array having become Metro-preferred (see
 * isDrPreferred). CPU% and storage usage% are excluded on purpose -- normal
 * day-to-day noise (still visible as "Attention" on their own tabs) that shouldn't by
 * itself recommend failing over an entire site.
 */
export function computeFailoverStatus(storage: StoragePayload | null, services: FailoverServiceLike[] = []): FailoverStatus {
  if (!storage?.enabled) {
    return { recommendation: "unconfigured", hasDr: false, primaryHealthy: true, drHealthy: false };
  }

  const drPowerstores = storage.powerstores.filter((t) => t.isDr);
  const drProxmoxes = storage.proxmoxes.filter((t) => t.isDr);
  const primaryPowerstores = storage.powerstores.filter((t) => !t.isDr);
  const primaryProxmoxes = storage.proxmoxes.filter((t) => !t.isDr);

  const hasDr = drPowerstores.length > 0 || drProxmoxes.length > 0;
  if (!hasDr) {
    return { recommendation: "unconfigured", hasDr: false, primaryHealthy: true, drHealthy: false };
  }

  const downServices = services.filter((s) => !s.up).length;
  const mostServicesDown = services.length > 0 && downServices > services.length / 2;
  const primaryHostDown = primaryProxmoxes.some((t) => !t.status.ok || t.status.nodes.some((n) => !n.online));
  const primaryPowerstoreDown = primaryPowerstores.some((t) => !t.status.ok || t.status.alerts.some((a) => isCriticalSeverity(a.severity)));
  const primaryHealthy = !mostServicesDown && !primaryHostDown && !primaryPowerstoreDown && !isDrPreferred(storage);

  // DR readiness prefers the DR PowerStore array's own health (Metro sync/alerts)
  // when one is configured, only falling back to DR Proxmox health when it isn't.
  const drHealthy =
    drPowerstores.length > 0 ? drPowerstores.every((t) => isPowerstoreHealthy(t.status)) : drProxmoxes.every((t) => isProxmoxHealthy(t.status));

  if (primaryHealthy) return { recommendation: "healthy", hasDr, primaryHealthy, drHealthy };
  if (drHealthy) return { recommendation: "recommend", hasDr, primaryHealthy, drHealthy };
  return { recommendation: "caution", hasDr, primaryHealthy, drHealthy };
}
