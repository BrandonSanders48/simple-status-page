import type { IntegrationCatalogEntry } from "./integrations/types";

export type IntegrationCatalogMeta = Omit<IntegrationCatalogEntry, "fetchStatus">;

/**
 * Client-safe catalog metadata -- no fetch functions here (those live in
 * lib/integrationRegistry.ts, server-only, since they pull in undici/insecureAgent).
 * Both the admin marketplace UI and lib/integrationRegistry.ts import this same list
 * so the field/label definitions never drift between the two.
 */
export const INTEGRATION_CATALOG_META: IntegrationCatalogMeta[] = [
  {
    key: "unifi",
    label: "UniFi",
    description: "Local UniFi Network controller (standalone or a UniFi OS console) -- subsystem health and device online/offline counts.",
    icon: "fa-wifi",
    color: "text-sky-500",
    logo: "/logos/unifi.svg",
    fields: [
      { key: "host", label: "Controller Host", type: "text", placeholder: "https://10.0.0.1" },
      { key: "username", label: "Username", type: "text" },
      { key: "password", label: "Password", type: "password" },
      { key: "site", label: "Site", type: "text", placeholder: "default" },
    ],
  },
  {
    key: "sophos_central",
    label: "Sophos Central",
    description: "Cloud-managed endpoint/firewall security -- device health and active alerts.",
    icon: "fa-shield-halved",
    color: "text-emerald-600",
    logo: "/logos/sophos.svg",
    fields: [
      { key: "clientId", label: "API Client ID", type: "text" },
      { key: "clientSecret", label: "API Client Secret", type: "password" },
    ],
  },
  {
    key: "sophos_xgs",
    label: "Sophos XGS Firewall",
    description: "On-prem Sophos Firewall (XGS series) -- device status and active alerts.",
    icon: "fa-fire-flame-curved",
    color: "text-red-500",
    logo: "/logos/sophos.svg",
    fields: [
      { key: "host", label: "Firewall Host", type: "text", placeholder: "https://10.0.0.1:4444" },
      { key: "username", label: "Username", type: "text" },
      { key: "password", label: "Password", type: "password" },
    ],
  },
  {
    key: "goto_connect",
    label: "GoTo Connect",
    description: "Hosted phone system -- line/extension and system status.",
    icon: "fa-phone",
    color: "text-orange-500",
    logo: "/logos/goto.svg",
    fields: [
      { key: "clientId", label: "OAuth Client ID", type: "text" },
      { key: "clientSecret", label: "OAuth Client Secret", type: "password" },
      { key: "personalAccessToken", label: "Personal Access Token", type: "password" },
    ],
  },
];

export function getIntegrationCatalogMeta(key: string): IntegrationCatalogMeta | undefined {
  return INTEGRATION_CATALOG_META.find((e) => e.key === key);
}
