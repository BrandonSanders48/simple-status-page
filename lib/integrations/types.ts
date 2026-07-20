/**
 * Shared shape every marketplace integration's fetch function returns. Unlike
 * PowerStore/Proxmox/PBS (each with their own bespoke display component), the public
 * Integrations tab renders every target generically off this one shape -- a summary
 * line plus a flat list of labeled rows -- so adding a new integration never needs a
 * new display component, only a new fetch function.
 */
export interface IntegrationStatus {
  ok: boolean;
  error?: string;
  /** Non-fatal notes about calls/fields that failed -- surfaced in the admin Test
   * Connection summary, same pattern as the PowerStore/Proxmox integrations. */
  diagnostics: string[];
  /** Rolled-up health used for the tab badge and the overall site status -- distinct
   * from `ok` (which only means "we could connect at all"): a reachable target can
   * still report unhealthy (e.g. a critical alert, a device offline). */
  healthy: boolean;
  /** One-line human summary shown next to the target's name, e.g. "42 devices online, 1 alert". */
  summary: string;
  /** Generic key/value rows for display -- e.g. { label: "Firewall01", value: "Online", ok: true }.
   * `ok: null` means "no definitive reading" (e.g. a subsystem that isn't configured/
   * used, or a field an integration doesn't confirm exists) -- shown neutrally, never
   * counted as a failure. Prefer `ok !== false` over truthy-checking `ok` wherever a
   * rollup is computed from items, so a null doesn't get miscounted as unhealthy. */
  items: { label: string; value: string; ok: boolean | null }[];
}

export interface IntegrationField {
  key: string;
  label: string;
  type: "text" | "password";
  placeholder?: string;
}

export interface IntegrationCatalogEntry {
  key: string;
  label: string;
  description: string;
  icon: string;
  color: string;
  /** Path under /public to a real brand logo (e.g. "/logos/unifi.svg"), shown instead
   * of the FontAwesome icon when present. */
  logo?: string;
  /** Whether this integration's targets can be flagged as the DR site (only
   * powerstore/proxmox -- it feeds the Failover tab). Shows a "DR site" checkbox in
   * the admin marketplace form when true. */
  supportsDr?: boolean;
  /** True for powerstore/proxmox/pbs: they have their own bespoke public display
   * (PowerstoreSection/ProxmoxSection/PbsSection, with alert-acknowledge/Metro/backup
   * task actions the generic card can't do) and their own cache (storageCache.ts/
   * pbsCache.ts), so lib/integrationsCache.ts's generic marketplace fetch excludes
   * them -- otherwise they'd be queried twice and shown twice. `fetchStatus` still
   * exists for these (used by the admin Test Connection button), it's just not
   * consumed by the public generic display. */
  hasBespokeDisplay?: boolean;
  fields: IntegrationField[];
  fetchStatus: (config: Record<string, string>) => Promise<IntegrationStatus>;
}
