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
    key: "powerstore",
    label: "Dell PowerStore",
    description: "Management IP/hostname and a read-only account for each array's REST API -- health, active alerts, and Metro replication status.",
    icon: "fa-database",
    color: "text-cyan-500",
    logo: "/logos/dell.svg",
    supportsDr: true,
    hasBespokeDisplay: true,
    fields: [
      { key: "host", label: "Management Host", type: "text", placeholder: "10.0.0.10" },
      { key: "username", label: "Username", type: "text" },
      { key: "password", label: "Password", type: "password" },
    ],
  },
  {
    key: "proxmox",
    label: "Proxmox",
    description: "Cluster API endpoint and an API token -- node/quorum health and how the cluster sees its storage. Add one target per cluster, e.g. a main site and a DR site.",
    icon: "fa-cubes",
    color: "text-orange-500",
    logo: "/logos/proxmox.svg",
    supportsDr: true,
    hasBespokeDisplay: true,
    fields: [
      { key: "host", label: "API Host", type: "text", placeholder: "https://10.0.0.5:8006" },
      { key: "tokenId", label: "API Token ID", type: "text", placeholder: "statuspage@pve!monitor" },
      { key: "tokenSecret", label: "API Token Secret", type: "password" },
      { key: "storageId", label: "Storage ID (optional)", type: "text", placeholder: "powerstore-nfs" },
    ],
  },
  {
    key: "pbs",
    label: "Proxmox Backup Server",
    description: "API endpoint and token for each PBS instance -- whether the most recent backup run completed without errors.",
    icon: "fa-box-archive",
    color: "text-lime-600",
    logo: "/logos/proxmox.svg",
    hasBespokeDisplay: true,
    fields: [
      { key: "host", label: "API Host", type: "text", placeholder: "https://10.0.0.30:8007" },
      { key: "tokenId", label: "API Token ID", type: "text", placeholder: "statuspage@pbs!monitor" },
      { key: "tokenSecret", label: "API Token Secret", type: "password" },
    ],
  },
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
    affectsOverallStatus: false,
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
      { key: "personalAccessToken", label: "Personal Access Token", type: "password", placeholder: "Leave blank if using a Refresh Token" },
      { key: "refreshToken", label: "Refresh Token", type: "password", placeholder: "Leave blank if using a Personal Access Token" },
    ],
  },
  {
    key: "meraki",
    label: "Cisco Meraki",
    description: "Cloud-managed switches/APs/security appliances -- device online/offline/alerting status across an organization.",
    icon: "fa-network-wired",
    color: "text-sky-600",
    logo: "/logos/meraki.svg",
    fields: [
      { key: "apiKey", label: "API Key", type: "password" },
      { key: "organizationId", label: "Organization ID (optional)", type: "text", placeholder: "Leave blank to auto-detect" },
    ],
  },
];

export function getIntegrationCatalogMeta(key: string): IntegrationCatalogMeta | undefined {
  return INTEGRATION_CATALOG_META.find((e) => e.key === key);
}
