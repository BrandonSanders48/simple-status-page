/**
 * Shared shape every marketplace integration's fetch function returns. Unlike
 * PowerStore/Proxmox/PBS (each with their own bespoke display component), the public
 * Integrations tab renders every target generically off this one shape - a summary
 * line plus a flat list of labeled rows - so adding a new integration never needs a
 * new display component, only a new fetch function.
 */
export interface IntegrationStatus {
  ok: boolean;
  error?: string;
  /** Non-fatal notes about calls/fields that failed - surfaced in the admin Test
   * Connection summary, same pattern as the PowerStore/Proxmox integrations. */
  diagnostics: string[];
  /** Rolled-up health used for the tab badge and the overall site status - distinct
   * from `ok` (which only means "we could connect at all"): a reachable target can
   * still report unhealthy (e.g. a critical alert, a device offline). */
  healthy: boolean;
  /** One-line human summary shown next to the target's name, e.g. "42 devices online, 1 alert". */
  summary: string;
  /** Generic key/value rows for display - e.g. { label: "Firewall01", value: "Online", ok: true }.
   * `ok: null` means "no definitive reading" (e.g. a subsystem that isn't configured/
   * used, or a field an integration doesn't confirm exists) - shown neutrally, never
   * counted as a failure. Prefer `ok !== false` over truthy-checking `ok` wherever a
   * rollup is computed from items, so a null doesn't get miscounted as unhealthy.
   * `key` is a stable per-row identifier scoped to this integration (e.g. a device
   * serial, an alert id, a fixed subsystem name) used only to let an admin "Ignore"
   * a specific alerting row (lib/integrationIgnore.ts) across polls - it's never
   * shown, so a value that's merely unique-enough (falling back to `label` when
   * there's no better natural id) is fine. */
  items: { label: string; value: string; ok: boolean | null; key: string }[];
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
   * powerstore/proxmox - it feeds the Failover tab). Shows a "DR site" checkbox in
   * the admin marketplace form when true. */
  supportsDr?: boolean;
  /** True for powerstore/proxmox/pbs: they have their own bespoke public display
   * (PowerstoreSection/ProxmoxSection/PbsSection, with alert-acknowledge/Metro/backup
   * task actions the generic card can't do) and their own cache (storageCache.ts/
   * pbsCache.ts), so lib/integrationsCache.ts's generic marketplace fetch excludes
   * them - otherwise they'd be queried twice and shown twice. `fetchStatus` still
   * exists for these (used by the admin Test Connection button), it's just not
   * consumed by the public generic display. */
  hasBespokeDisplay?: boolean;
  /** False for sophos_central: an unhealthy endpoint or a security alert is a
   * posture/security signal, not an "our infrastructure is down" signal - nothing
   * about it (short of Sophos's own DNS Protection service itself failing, which
   * isn't distinguishable from other alert types via the Alerts API; there's no
   * documented category/product field that separates it out) means services are
   * actually unavailable. The card still shows its own Healthy/Attention pill and
   * item list unchanged; this only keeps it from flipping the site-wide "Issues
   * Detected" banner, matching this app's existing convention that hygiene/security
   * signals (like backups, CPU, storage %) don't drive availability rollups either.
   * Defaults to true (affects the overall banner) for every other integration. */
  affectsOverallStatus?: boolean;
  fields: IntegrationField[];
  fetchStatus: (config: Record<string, string>) => Promise<IntegrationStatus>;
}
