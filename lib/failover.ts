import { isPowerstoreHealthy, isProxmoxHealthy, type StoragePayload } from "@/components/StorageSections";

export type FailoverRecommendation = "healthy" | "recommend" | "caution" | "unconfigured";

export interface FailoverStatus {
  recommendation: FailoverRecommendation;
  hasDr: boolean;
  primaryHealthy: boolean;
  drHealthy: boolean;
}

/**
 * Compares the health of whichever targets are flagged as the DR site against the
 * rest (the "primary" site) using data already fetched for the Storage/Proxmox tabs --
 * no separate polling needed. "recommend" only fires when the primary site looks
 * unhealthy AND the DR site looks healthy; if both are unhealthy this deliberately
 * stops short of recommending a failover into another bad environment.
 */
export function computeFailoverStatus(storage: StoragePayload | null): FailoverStatus {
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

  const primaryHealthy =
    primaryPowerstores.every((t) => isPowerstoreHealthy(t.status)) && primaryProxmoxes.every((t) => isProxmoxHealthy(t.status));
  const drHealthy = drPowerstores.every((t) => isPowerstoreHealthy(t.status)) && drProxmoxes.every((t) => isProxmoxHealthy(t.status));

  if (primaryHealthy) return { recommendation: "healthy", hasDr, primaryHealthy, drHealthy };
  if (drHealthy) return { recommendation: "recommend", hasDr, primaryHealthy, drHealthy };
  return { recommendation: "caution", hasDr, primaryHealthy, drHealthy };
}
