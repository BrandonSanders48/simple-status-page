import { fetch as undiciFetch } from "undici";
import type { IntegrationStatus } from "./types";

/**
 * Sophos Central (api.central.sophos.com) is OAuth2 + multi-tenant: unlike
 * Proxmox/PowerStore (a single host + static credential), talking to it is a
 * three-step dance --
 *   1. Exchange Client ID + Client Secret for a bearer token (Sophos ID, a
 *      separate host from the API itself).
 *   2. Call /whoami/v1 with that token to find out which tenant/organization/
 *      partner this credential belongs to, and which regional data-center
 *      host ("dataRegion") actually holds its data -- Sophos federates
 *      tenants across regions, so api.central.sophos.com itself only answers
 *      /whoami/v1 and redirects everything else to a region-specific host.
 *   3. Call the actual data endpoints against that regional host, with the
 *      id from step 2 echoed back in a tenant-scoping header.
 * Endpoints/fields below were checked against developer.sophos.com (via web
 * search + community/XSOAR integration references, since the docs site itself
 * is a JS app that doesn't return static HTML to a plain fetch) as of writing
 * this -- see the per-section notes for confidence level. Nothing here is
 * guessed purely from memory, but as with PowerStore's integration, treat any
 * "UNVERIFIED" note as a real risk of drift against a live tenant and check
 * `diagnostics` (surfaced in the admin Test Connection summary) if a field
 * comes back empty.
 */

interface SophosCentralConfig {
  clientId: string;
  clientSecret: string;
}

type JsonRecord = Record<string, unknown>;
type FetchResult = { data: unknown; error: null } | { data: null; error: string };

// HIGH confidence: this is Sophos's published identity host, distinct from the
// Central API host itself -- confirmed via developer.sophos.com/getting-started-tenant
// and Sophos community posts showing the exact curl invocation.
const TOKEN_URL = "https://id.sophos.com/api/v2/oauth2/token";

// HIGH confidence: the one fixed, non-regional Central API route -- every
// tenant/organization/partner credential can call this host+path regardless
// of where its data actually lives.
const WHOAMI_URL = "https://api.central.sophos.com/whoami/v1";

// Sophos Central alerts have no "critical" tier -- confirmed (independently,
// via a community thread and the Cortex XSOAR Sophos Central integration
// reference) that `severity` is one of "high" | "medium" | "low". Treating
// "high" as the critical-equivalent for the healthy rollup below.
const CRITICAL_ALERT_SEVERITIES = new Set(["high"]);

// Endpoint health.overall values -- confirmed via a real example response
// (health.overall / health.threats.status / health.services.status) surfaced
// through Sophos Central Endpoint API discussion threads: "good" | "bad" |
// "suspicious" | "unknown". Anything other than "good" is treated as unhealthy.
const HEALTHY_ENDPOINT_STATUSES = new Set(["good"]);

/**
 * OAuth2 client-credentials token exchange. HIGH confidence on shape: form-encoded
 * body (not JSON), `scope=token`, response has `access_token` + `expires_in` --
 * matches Sophos's own published curl example.
 */
async function getAccessToken(
  clientId: string,
  clientSecret: string,
  timeoutMs = 8000
): Promise<{ token: string; error: null } | { token: null; error: string }> {
  try {
    const res = await undiciFetch(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "client_credentials",
        client_id: clientId,
        client_secret: clientSecret,
        scope: "token",
      }).toString(),
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return { token: null, error: `oauth2/token returned HTTP ${res.status}${body ? `: ${body.slice(0, 200)}` : ""}` };
    }
    const json = (await res.json()) as JsonRecord;
    const token = typeof json.access_token === "string" ? json.access_token : null;
    if (!token) return { token: null, error: "oauth2/token response did not include an access_token" };
    return { token, error: null };
  } catch (err) {
    return { token: null, error: err instanceof Error ? `oauth2/token: ${err.message}` : "oauth2/token request failed" };
  }
}

interface WhoAmI {
  id: string;
  idType: string;
  dataRegion: string;
}

/**
 * Discovers this credential's tenant/organization/partner id and its regional
 * API host. HIGH confidence on `id`/`idType`/`apiHosts.dataRegion` -- all three
 * are cross-confirmed by developer.sophos.com search results and a public
 * Sophos SIEM integration's own client code reading these exact fields.
 */
async function whoami(token: string, timeoutMs = 8000): Promise<{ info: WhoAmI; error: null } | { info: null; error: string }> {
  try {
    const res = await undiciFetch(WHOAMI_URL, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return { info: null, error: `whoami/v1 returned HTTP ${res.status}${body ? `: ${body.slice(0, 200)}` : ""}` };
    }
    const json = (await res.json()) as JsonRecord;
    const id = typeof json.id === "string" ? json.id : null;
    const idType = typeof json.idType === "string" ? json.idType : null;
    const apiHosts = json.apiHosts as JsonRecord | undefined;
    const dataRegion = typeof apiHosts?.dataRegion === "string" ? apiHosts.dataRegion : null;
    if (!id || !idType || !dataRegion) {
      return { info: null, error: "whoami/v1 response missing id/idType/apiHosts.dataRegion" };
    }
    return { info: { id, idType, dataRegion }, error: null };
  } catch (err) {
    return { info: null, error: err instanceof Error ? `whoami/v1: ${err.message}` : "whoami/v1 request failed" };
  }
}

/**
 * Which header carries the scoping id on data calls depends on what kind of
 * principal whoami/v1 reported. HIGH confidence on "tenant" -> X-Tenant-ID
 * (the common case this integration is built for). MEDIUM confidence on the
 * organization/partner header names -- confirmed by name via developer.sophos.com
 * search results ("Getting Started as an Organization" + community threads on
 * X-Organization-ID/X-Partner-ID) but not exercised against a live MSP-tier
 * credential, since this integration expects a single-tenant Client ID/Secret.
 */
function tenantHeaderName(idType: string): string {
  if (idType === "organization") return "X-Organization-ID";
  if (idType === "partner") return "X-Partner-ID";
  return "X-Tenant-ID";
}

async function get(
  dataRegion: string,
  token: string,
  tenantHeader: string,
  tenantId: string,
  path: string,
  timeoutMs = 8000
): Promise<FetchResult> {
  try {
    const res = await undiciFetch(`${dataRegion}${path}`, {
      headers: { Authorization: `Bearer ${token}`, [tenantHeader]: tenantId },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return { data: null, error: `${path} returned HTTP ${res.status}${body ? `: ${body.slice(0, 200)}` : ""}` };
    }
    return { data: await res.json(), error: null };
  } catch (err) {
    return { data: null, error: err instanceof Error ? `${path}: ${err.message}` : `${path}: request failed` };
  }
}

/** Every Sophos Central v1 list endpoint wraps its rows in `{ pages, items }`
 * (confirmed for both /common/v1/alerts and /endpoint/v1/endpoints). */
function itemsOf(data: unknown): JsonRecord[] {
  const body = data as { items?: JsonRecord[] };
  return Array.isArray(body?.items) ? body.items : [];
}

/** True if the response's `pages` object indicates there's more data beyond
 * the page we fetched -- used only to add a diagnostic note, not to paginate
 * (a status page only needs to know "is anything unhealthy right now", and
 * looping full pagination here would risk being slow on a large estate). */
function hasMorePages(data: unknown): boolean {
  const body = data as { pages?: { nextKey?: unknown } };
  return typeof body?.pages?.nextKey === "string" && body.pages.nextKey.length > 0;
}

/**
 * Fetches Sophos Central status: active alerts (Common API) and endpoint
 * health (Endpoint API), for the tenant identified by the given Client
 * ID/Secret. See https://developer.sophos.com/ (intro + getting-started-tenant)
 * for the auth flow this follows.
 */
export async function fetchSophosCentralStatus(config: Record<string, string>): Promise<IntegrationStatus> {
  const clientId = (config.clientId ?? "").trim();
  const clientSecret = (config.clientSecret ?? "").trim();
  if (!clientId || !clientSecret) {
    return { ok: false, error: "Client ID and Client Secret are required.", diagnostics: [], healthy: false, summary: "", items: [] };
  }

  const cfg: SophosCentralConfig = { clientId, clientSecret };
  const diagnostics: string[] = [];

  try {
    const tokenResult = await getAccessToken(cfg.clientId, cfg.clientSecret);
    if (!tokenResult.token) throw new Error(tokenResult.error ?? "oauth2/token: unknown error");

    const whoamiResult = await whoami(tokenResult.token);
    if (!whoamiResult.info) throw new Error(whoamiResult.error ?? "whoami/v1: unknown error");
    const { id: tenantId, idType, dataRegion } = whoamiResult.info;

    if (idType !== "tenant") {
      diagnostics.push(
        `whoami/v1 reported idType "${idType}" (id ${tenantId}), not "tenant" -- this Client ID/Secret is scoped to a Sophos Central ${idType} account, so alert/endpoint data below (if any comes back) reflects whatever that ${idType}-level id can see, not necessarily a single customer's estate.`
      );
    }
    const tenantHeader = tenantHeaderName(idType);

    const [alertsResult, endpointsResult] = await Promise.all([
      // MEDIUM-HIGH confidence on path/shape: developer.sophos.com/docs/common-v1/1/routes/alerts/get,
      // cross-checked against the XSOAR Sophos Central integration reference.
      get(dataRegion, tokenResult.token, tenantHeader, tenantId, "/common/v1/alerts?pageSize=100"),
      // MEDIUM-HIGH confidence on path; MEDIUM confidence on the health.* shape below
      // (seen as a real example response, not the primary docs page itself, which is
      // a JS app that didn't return static content to a plain fetch).
      get(dataRegion, tokenResult.token, tenantHeader, tenantId, "/endpoint/v1/endpoints?pageSize=100"),
    ]);

    if (alertsResult.error && endpointsResult.error) {
      throw new Error(alertsResult.error);
    }

    let criticalAlertCount = 0;
    const alertItems: { label: string; value: string; ok: boolean }[] = [];
    if (alertsResult.error) {
      diagnostics.push(alertsResult.error);
    } else {
      if (hasMorePages(alertsResult.data)) {
        diagnostics.push("common/v1/alerts: more alerts exist beyond the first 100 -- showing only the first page.");
      }
      // NOTE (unverified assumption): /common/v1/alerts has no documented
      // "resolved"/"acknowledged" field in the rows it returns -- treating every
      // row here as a currently-active alert, on the assumption (matching how the
      // Central UI's Alerts view behaves) that resolved alerts simply drop out of
      // this list rather than staying with a resolved flag set.
      for (const a of itemsOf(alertsResult.data)) {
        const severity = typeof a.severity === "string" ? a.severity : "unknown";
        const description = typeof a.description === "string" ? a.description : typeof a.type === "string" ? a.type : "Sophos alert";
        const isCritical = CRITICAL_ALERT_SEVERITIES.has(severity.toLowerCase());
        if (isCritical) criticalAlertCount++;
        alertItems.push({ label: description, value: severity, ok: !isCritical });
      }
    }

    let unhealthyEndpointCount = 0;
    let totalEndpointCount = 0;
    const endpointItems: { label: string; value: string; ok: boolean }[] = [];
    if (endpointsResult.error) {
      diagnostics.push(endpointsResult.error);
    } else {
      if (hasMorePages(endpointsResult.data)) {
        diagnostics.push("endpoint/v1/endpoints: more endpoints exist beyond the first 100 -- summary/health below only covers that first page.");
      }
      const rows = itemsOf(endpointsResult.data);
      totalEndpointCount = rows.length;
      for (const e of rows) {
        const health = e.health as JsonRecord | undefined;
        const overall = typeof health?.overall === "string" ? health.overall : "unknown";
        const isHealthy = HEALTHY_ENDPOINT_STATUSES.has(overall.toLowerCase());
        if (!isHealthy) {
          unhealthyEndpointCount++;
          const hostname = typeof e.hostname === "string" ? e.hostname : typeof e.id === "string" ? e.id : "Unknown endpoint";
          endpointItems.push({ label: hostname, value: overall, ok: false });
        }
      }
    }

    const healthy = criticalAlertCount === 0 && unhealthyEndpointCount === 0;

    const summaryParts: string[] = [];
    if (!alertsResult.error) summaryParts.push(`${alertItems.length} active alert${alertItems.length === 1 ? "" : "s"}${criticalAlertCount ? ` (${criticalAlertCount} high)` : ""}`);
    if (!endpointsResult.error) summaryParts.push(`${unhealthyEndpointCount} of ${totalEndpointCount} endpoint${totalEndpointCount === 1 ? "" : "s"} unhealthy`);
    const summary = summaryParts.length ? summaryParts.join(", ") : "Connected, but no alert/endpoint data was available.";

    return {
      ok: true,
      diagnostics,
      healthy,
      summary,
      items: [...alertItems, ...endpointItems],
    };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Failed to query Sophos Central",
      diagnostics,
      healthy: false,
      summary: "",
      items: [],
    };
  }
}
