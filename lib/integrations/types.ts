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
  /** Generic key/value rows for display -- e.g. { label: "Firewall01", value: "Online", ok: true }. */
  items: { label: string; value: string; ok: boolean }[];
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
  fields: IntegrationField[];
  fetchStatus: (config: Record<string, string>) => Promise<IntegrationStatus>;
}
