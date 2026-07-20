import { INTEGRATION_CATALOG_META } from "./integrationCatalogMeta";
import type { IntegrationCatalogEntry } from "./integrations/types";
import { fetchUnifiStatus } from "./integrations/unifi";
import { fetchSophosCentralStatus } from "./integrations/sophosCentral";
import { fetchSophosXgsStatus } from "./integrations/sophosXgs";
import { fetchGotoConnectStatus } from "./integrations/gotoConnect";

const FETCHERS: Record<string, IntegrationCatalogEntry["fetchStatus"]> = {
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
