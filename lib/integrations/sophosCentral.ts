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
// reference) that `severity` is one of "high" | "medium" | "low". Only "high"
// counts as a real problem for the healthy rollup: Sophos's own "medium"/"low"
// tiers cover plenty of routine/informational events (a blocked test app, a
// certificate renewing successfully) alongside genuine ones, with no separate
// field to tell those apart -- so they're shown neutrally (see mapAlertOk)
// rather than reading as either a red flag or a clean bill of health.
const CRITICAL_ALERT_SEVERITIES = new Set(["high"]);

function mapAlertOk(severity: string): boolean | null {
  if (CRITICAL_ALERT_SEVERITIES.has(severity)) return false;
  return null;
}

// Endpoint health.overall values -- confirmed via a real example response
// (health.overall / health.threats.status / health.services.status, including
// a services.serviceDetails[] of individual service name/status pairs when
// services.status is "bad") surfaced through Sophos Central Endpoint API
// documentation: "good" | "bad" | "suspicious" | "unknown". Anything other
// than "good" is treated as unhealthy.
const HEALTHY_ENDPOINT_STATUSES = new Set(["good"]);

/** Turns `health.overall: "bad"` into something a person can act on --
 * "bad" alone doesn't say whether it's a live threat or just a stopped
 * service, so this reads the threats/services sub-status (and, for services,
 * which ones) to build a real reason string. Falls back to the bare overall
 * status if neither sub-field explains it (e.g. an undocumented cause). */
function describeEndpointHealth(health: JsonRecord | undefined): string {
  if (!health) return "Unknown";
  const overall = typeof health.overall === "string" ? health.overall : "unknown";
  const reasons: string[] = [];

  const threats = health.threats as JsonRecord | undefined;
  if (typeof threats?.status === "string" && threats.status.toLowerCase() !== "good") {
    reasons.push("active threat detected");
  }

  const services = health.services as JsonRecord | undefined;
  if (typeof services?.status === "string" && services.status.toLowerCase() !== "good") {
    const details = Array.isArray(services.serviceDetails) ? (services.serviceDetails as JsonRecord[]) : [];
    const stopped = details
      .filter((s) => typeof s.status === "string" && s.status.toLowerCase() !== "running")
      .map((s) => (typeof s.name === "string" ? s.name : "service"));
    reasons.push(stopped.length > 0 ? `${stopped.join(", ")} stopped` : "a service isn't running");
  }

  if (reasons.length === 0) return overall;
  return `${overall} (${reasons.join("; ")})`;
}

function formatAlertTime(raisedAt: string): string {
  const d = new Date(raisedAt);
  if (isNaN(d.getTime())) return raisedAt;
  return d.toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

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

/** The `pages.nextKey` value to pass back as `pageFromKey` for the next page, or
 * null once there isn't one -- confirmed via Sophos's key-based pagination scheme
 * (community "Getting Started" examples): a response with no `nextKey` means this
 * was the last page. */
function nextPageKey(data: unknown): string | null {
  const body = data as { pages?: { nextKey?: unknown } };
  return typeof body?.pages?.nextKey === "string" && body.pages.nextKey.length > 0 ? body.pages.nextKey : null;
}

// Upper bound on pages walked per list endpoint (100 items/page, Sophos's own max) --
// a status page needs a real answer ("is anything unhealthy"), not just the first 100
// of a multi-thousand-endpoint estate, but this still bounds worst-case latency/load
// against a very large tenant. Hitting this cap is noted in diagnostics rather than
// silently under-reporting.
const MAX_PAGES = 25;

/** Walks every page of a Sophos Central v1 list endpoint (key-based pagination via
 * `pageFromKey`/`pages.nextKey`), returning every row across all pages up to
 * MAX_PAGES. A page-fetch error partway through returns what was gathered so far
 * plus a diagnostic, rather than discarding already-fetched pages. */
async function getAllPages(
  dataRegion: string,
  token: string,
  tenantHeader: string,
  tenantId: string,
  basePath: string,
  label: string,
  diagnostics: string[]
): Promise<{ items: JsonRecord[]; error: string | null }> {
  const items: JsonRecord[] = [];
  let pageFromKey: string | null = null;
  let firstPageError: string | null = null;

  for (let page = 0; page < MAX_PAGES; page++) {
    const path = pageFromKey ? `${basePath}&pageFromKey=${encodeURIComponent(pageFromKey)}` : basePath;
    const result = await get(dataRegion, token, tenantHeader, tenantId, path);
    if (result.error) {
      if (page === 0) firstPageError = result.error;
      else diagnostics.push(`${label}: stopped after ${page} page(s) -- ${result.error}`);
      break;
    }
    items.push(...itemsOf(result.data));
    pageFromKey = nextPageKey(result.data);
    if (!pageFromKey) break;
    if (page === MAX_PAGES - 1) {
      diagnostics.push(`${label}: more data exists beyond ${MAX_PAGES * 100} items -- stopped there to bound request time.`);
    }
  }

  return { items, error: firstPageError };
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
      // cross-checked against the XSOAR Sophos Central integration reference. Walks
      // every page (see getAllPages) rather than just the first 100 -- a tenant with
      // more alerts than that would otherwise silently miss critical ones past page 1.
      getAllPages(dataRegion, tokenResult.token, tenantHeader, tenantId, "/common/v1/alerts?pageSize=100", "common/v1/alerts", diagnostics),
      // MEDIUM-HIGH confidence on path; MEDIUM confidence on the health.* shape below
      // (seen as a real example response, not the primary docs page itself, which is
      // a JS app that didn't return static content to a plain fetch). Also fully
      // paginated -- an estate of 100+ endpoints (a real reported case) would
      // otherwise show "0 of 100 unhealthy" while endpoints past page 1 go unchecked.
      getAllPages(dataRegion, tokenResult.token, tenantHeader, tenantId, "/endpoint/v1/endpoints?pageSize=100", "endpoint/v1/endpoints", diagnostics),
    ]);

    if (alertsResult.error && endpointsResult.error) {
      throw new Error(alertsResult.error);
    }

    let criticalAlertCount = 0;
    const alertItems: { label: string; value: string; ok: boolean | null }[] = [];
    if (alertsResult.error) {
      diagnostics.push(alertsResult.error);
    } else {
      // NOTE (unverified assumption): /common/v1/alerts has no documented
      // "resolved"/"acknowledged" field in the rows it returns -- treating every
      // row here as a currently-active alert, on the assumption (matching how the
      // Central UI's Alerts view behaves) that resolved alerts simply drop out of
      // this list rather than staying with a resolved flag set.
      for (const a of alertsResult.items) {
        const severity = typeof a.severity === "string" ? a.severity.toLowerCase() : "unknown";
        const description = typeof a.description === "string" ? a.description : typeof a.type === "string" ? a.type : "Sophos alert";
        const raisedAt = typeof a.raisedAt === "string" ? formatAlertTime(a.raisedAt) : null;
        if (CRITICAL_ALERT_SEVERITIES.has(severity)) criticalAlertCount++;
        alertItems.push({ label: raisedAt ? `${description} (${raisedAt})` : description, value: severity, ok: mapAlertOk(severity) });
      }
    }

    let unhealthyEndpointCount = 0;
    let totalEndpointCount = 0;
    const endpointItems: { label: string; value: string; ok: boolean | null }[] = [];
    if (endpointsResult.error) {
      diagnostics.push(endpointsResult.error);
    } else {
      totalEndpointCount = endpointsResult.items.length;
      for (const e of endpointsResult.items) {
        const health = e.health as JsonRecord | undefined;
        const overall = typeof health?.overall === "string" ? health.overall : "unknown";
        const isHealthy = HEALTHY_ENDPOINT_STATUSES.has(overall.toLowerCase());
        if (!isHealthy) {
          unhealthyEndpointCount++;
          const hostname = typeof e.hostname === "string" ? e.hostname : typeof e.id === "string" ? e.id : "Unknown endpoint";
          endpointItems.push({ label: `${hostname} -- ${describeEndpointHealth(health)}`, value: overall, ok: false });
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
