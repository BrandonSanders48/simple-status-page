import { fetch as undiciFetch } from "undici";
import type { IntegrationStatus } from "./types";

/**
 * GoTo Connect (formerly Jive/LogMeIn) admin/voice APIs for a customer's own hosted
 * phone system - NOT the public status.goto.com feed, which this app surfaces as its
 * own separate "GoTo Status" integration.
 *
 * Also doubles as an outbound notification channel: sendGotoConnectSms (near the
 * bottom of this file) sends a plain-text SMS via this same target's credentials,
 * used by lib/notifier.ts alongside subscriber email and the webhook. That's a
 * distinct GoTo API (Messaging, not Voice Admin) needing its own OAuth scope - see
 * sendGotoConnectSms's own doc comment.
 *
 * This is a server-side background poller with no user present to run an interactive
 * OAuth consent flow, so `config` supports two mutually exclusive ways to authenticate
 * - an admin fills in exactly one, not both:
 *   - Personal Access Token (PAT): self-service, created once at
 *     https://myaccount.goto.com -> Developer Tools -> Create token, no
 *     authorization-code round trip required. The OAuth Client itself still needs the
 *     "Personal Access Token" grant type toggled on at
 *     https://developer.logmeininc.com/clients. Simpler to set up; prefer this unless
 *     there's a reason not to.
 *   - Refresh token: a long-lived token obtained once, out of band, via GoTo's OAuth
 *     authorization-code flow - useful when PAT creation isn't available/allowed for
 *     an account.
 * Every call exchanges whichever one is configured for a short-lived access token
 * (personal_access_token or refresh_token grant, respectively); clientId/clientSecret
 * are required either way.
 *
 * Endpoints/fields below were checked against GoTo's current developer docs at
 * https://developer.goto.com/ (mid-2026):
 *   - PAT exchange: https://developer.goto.com/guides/Authentication/03.1_HOW_accessTokenPAT/
 *     - CONFIRMED: POST to authentication.logmeininc.com/oauth/token, Basic auth of
 *     clientId:clientSecret, grant_type=personal_access_token&pat=<token>. Response is a
 *     normal OAuth token response (access_token, expires_in ~3600s). (The older
 *     api.getgo.com/oauth/v2 token host from GoTo's own older guides was decommissioned
 *     September 30, 2025.)
 *   - Refresh token exchange: https://developer.goto.com/guides/Authentication/05_HOW_refreshToken/
 *     - CONFIRMED: same token endpoint, grant_type=refresh_token&refresh_token=<token>.
 *     GoTo may rotate the refresh token itself on use, returning a new one alongside
 *     the access token - this integration has no way to persist that back to `config`,
 *     so if a previously-working refresh token starts being rejected, the fix is
 *     re-running the authorization-code flow for a fresh one (or switching to a PAT).
 *   - Account key lookup: https://developer.goto.com/guides/GoToConnect/09_HOW_fetchAccountUsers/
 *     - CONFIRMED: GET api.getgo.com/admin/rest/v1/me returns the accounts this token
 *     can act on; their `key` is the accountKey every Voice Admin API call needs.
 *   - Voice Admin API (phone numbers): https://developer.goto.com/guides/GoToConnect/13_HOW_useVoiceAdminApis/
 *     - CONFIRMED endpoint/shape: GET api.goto.com/voice-admin/v1/phone-numbers, scope
 *     voice-admin.v1.read. GoTo's changelog notes this response now includes a `status`
 *     field per number, but does not document its enum values, so it's shown verbatim
 *     rather than mapped to ok/not-ok beyond a short guess list (see HEALTHY_STATUSES).
 *   - Voice Admin API (extensions): confirmed to exist and to have moved from
 *     api.jive.com to api.goto.com (same /voice-admin/v1/extensions path), but GoTo's
 *     public docs did not turn up a documented response schema for it - in particular
 *     there's no confirmed field for "is this extension's phone actually registered".
 *     fetchExtensions() below guesses at `status`/`phone.status` (mirroring the phone
 *     numbers shape) and falls back to listing extensions as configured, with no
 *     health signal, if neither is present. Treat this endpoint's mapping as the least
 *     trustworthy part of this file and correct it against a real account's response.
 *
 * Unlike a refresh token, GoTo's docs don't describe the PAT itself rotating on use -
 * each call just re-exchanges the same stored PAT for a fresh short-lived access token.
 * If GoTo ever starts rejecting the configured token as invalid/expired, the fix is to
 * create a new Personal Access Token at myaccount.goto.com (PATs can be revoked/expired
 * independently by an admin there) and update the config with it.
 */

type JsonRecord = Record<string, unknown>;
type FetchResult = { data: JsonRecord; error: null } | { data: null; error: string };
type TokenResult = { token: string; error: null } | { token: null; error: string };

const TOKEN_URL = "https://authentication.logmeininc.com/oauth/token";
const ADMIN_HOST = "https://api.getgo.com";
const VOICE_HOST = "https://api.goto.com";

/** Best-guess "this row looks healthy" values - GoTo doesn't publish the enum for
 * phone-number/extension status, so this is deliberately a short allow-list rather
 * than a deny-list: anything not recognized is treated as a diagnostic-worthy
 * "unknown", not silently marked healthy. See fetchPhoneNumbers/fetchExtensions. */
const HEALTHY_STATUSES = new Set(["connected", "active", "assigned", "in_service", "inservice", "ok", "online", "registered"]);

/** Exchanges a Personal Access Token for a short-lived access token. Confirmed against
 * https://developer.goto.com/guides/Authentication/03.1_HOW_accessTokenPAT/ */
async function exchangePersonalAccessToken(clientId: string, clientSecret: string, pat: string): Promise<TokenResult> {
  try {
    const basic = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
    const res = await undiciFetch(TOKEN_URL, {
      method: "POST",
      headers: {
        Authorization: `Basic ${basic}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: `grant_type=personal_access_token&pat=${encodeURIComponent(pat)}`,
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return { token: null, error: `PAT exchange returned HTTP ${res.status}${body ? `: ${body.slice(0, 200)}` : ""}` };
    }
    const json = (await res.json()) as JsonRecord;
    if (typeof json.access_token !== "string") {
      return { token: null, error: "PAT exchange response had no access_token field" };
    }
    return { token: json.access_token, error: null };
  } catch (err) {
    return { token: null, error: err instanceof Error ? `PAT exchange: ${err.message}` : "PAT exchange failed" };
  }
}

/** Exchanges the long-lived refresh token for a short-lived access token. Confirmed
 * against https://developer.goto.com/guides/Authentication/05_HOW_refreshToken/ */
async function exchangeRefreshToken(clientId: string, clientSecret: string, refreshToken: string): Promise<TokenResult> {
  try {
    const basic = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
    const res = await undiciFetch(TOKEN_URL, {
      method: "POST",
      headers: {
        Authorization: `Basic ${basic}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: `grant_type=refresh_token&refresh_token=${encodeURIComponent(refreshToken)}`,
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return { token: null, error: `Token refresh returned HTTP ${res.status}${body ? `: ${body.slice(0, 200)}` : ""}` };
    }
    const json = (await res.json()) as JsonRecord;
    if (typeof json.access_token !== "string") {
      return { token: null, error: "Token refresh response had no access_token field" };
    }
    return { token: json.access_token, error: null };
  } catch (err) {
    return { token: null, error: err instanceof Error ? `Token refresh: ${err.message}` : "Token refresh failed" };
  }
}

/** Picks whichever grant is configured (PAT or refresh token - see the file-level
 * comment) and exchanges it for a short-lived access token. Shared by
 * fetchGotoConnectStatus and sendGotoConnectSms so the PAT-vs-refresh branch only
 * lives in one place. */
async function getAccessToken(clientId: string, clientSecret: string, personalAccessToken: string, refreshToken: string): Promise<TokenResult> {
  return personalAccessToken
    ? exchangePersonalAccessToken(clientId, clientSecret, personalAccessToken)
    : exchangeRefreshToken(clientId, clientSecret, refreshToken);
}

async function get(accessToken: string, url: string, timeoutMs = 8000): Promise<FetchResult> {
  try {
    const res = await undiciFetch(url, {
      headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return { data: null, error: `${url} returned HTTP ${res.status}${body ? `: ${body.slice(0, 200)}` : ""}` };
    }
    return { data: (await res.json()) as JsonRecord, error: null };
  } catch (err) {
    return { data: null, error: err instanceof Error ? `${url}: ${err.message}` : `${url}: request failed` };
  }
}

// Upper bound on pages walked per list endpoint - GoTo's Voice Admin API appears to
// default to a 50-item page (per a real account hitting exactly that limit), so this
// still covers a sizeable account without an unbounded worst case.
const MAX_PAGES = 25;

/** Walks every page of a Voice Admin API list endpoint. MEDIUM confidence only: GoTo's
 * docs confirm the response's `nextPageMarker` field but don't show a worked example
 * of submitting it back, so this assumes the common `nextPageMarker` (response) ->
 * `pageMarker` (request) naming convention. Defensively bails if a page doesn't
 * actually advance (the returned marker repeats), on the assumption the param name
 * needs correcting rather than looping forever against a real account. */
async function getAllPages(accessToken: string, baseUrl: string, diagnostics: string[]): Promise<JsonRecord[]> {
  const items: JsonRecord[] = [];
  let pageMarker: string | null = null;
  let lastMarker: string | null = null;

  for (let page = 0; page < MAX_PAGES; page++) {
    const url = pageMarker ? `${baseUrl}&pageMarker=${encodeURIComponent(pageMarker)}` : baseUrl;
    const result = await get(accessToken, url);
    if (result.error !== null) {
      diagnostics.push(page === 0 ? result.error : `${baseUrl}: stopped after ${page} page(s) - ${result.error}`);
      break;
    }
    const rows = Array.isArray(result.data.items) ? (result.data.items as JsonRecord[]) : [];
    items.push(...rows);

    const nextMarker = typeof result.data.nextPageMarker === "string" && result.data.nextPageMarker ? result.data.nextPageMarker : null;
    if (!nextMarker) break;
    if (nextMarker === lastMarker) {
      diagnostics.push(
        `${baseUrl}: nextPageMarker didn't change after submitting it back as pageMarker - pagination may need a different query ` +
          "param name for this account; stopped to avoid looping. Only the first page is reflected here."
      );
      break;
    }
    lastMarker = nextMarker;
    pageMarker = nextMarker;
    if (page === MAX_PAGES - 1) {
      diagnostics.push(`${baseUrl}: more results exist beyond ${MAX_PAGES} pages - stopped there to bound request time.`);
    }
  }

  return items;
}

/** Every Voice Admin API call is scoped to an accountKey, resolved from whichever
 * GoTo accounts this token's owner belongs to. If `configured` is set (GoTo's own
 * setup docs have admins retrieve this once via the Admin API and pin it, rather
 * than auto-detecting it every call), it's used as-is once confirmed to be one of
 * the accounts this token can actually see; otherwise the first account is picked
 * automatically (diagnosing the choice if there's more than one - e.g. a
 * reseller/multi-tenant login). Always calls /me either way, purely so a diagnostic
 * can report every account this token can see, same reasoning as this app's Meraki
 * organizationId auto-detect. */
async function fetchAccountKey(accessToken: string, configured: string, diagnostics: string[]): Promise<string | null> {
  const result = await get(accessToken, `${ADMIN_HOST}/admin/rest/v1/me`);
  if (result.error !== null) {
    diagnostics.push(result.error);
    return configured || null;
  }
  const accounts = Array.isArray(result.data.accounts) ? (result.data.accounts as JsonRecord[]) : [];
  const keyOf = (a: JsonRecord): string | null => (typeof a.key === "string" ? a.key : typeof a.key === "number" ? String(a.key) : null);
  const describe = (a: JsonRecord) => `${String(a.name ?? keyOf(a))} [${String(keyOf(a))}]`;

  if (configured) {
    const match = accounts.find((a) => keyOf(a) === configured);
    if (match) {
      diagnostics.push(`Using account ${describe(match)}.`);
    } else {
      diagnostics.push(
        `Configured Account Key "${configured}" was not found among the ${accounts.length} account(s) this token can see` +
          (accounts.length > 0 ? ` (${accounts.map(describe).join(", ")})` : "") +
          " - double-check it against the GoTo Admin API. Using it anyway in case this token can see it but not list it."
      );
    }
    return configured;
  }

  const firstAccount = accounts[0];
  if (!firstAccount) {
    diagnostics.push("/admin/rest/v1/me returned no accounts for this token");
    return null;
  }
  diagnostics.push(
    `Using account ${describe(firstAccount)}` +
      (accounts.length > 1
        ? ` - this token can see ${accounts.length} accounts total (${accounts.map(describe).join(", ")}); set Account Key in the integration's config to pin a different one.`
        : ".")
  );
  const key = keyOf(firstAccount);
  if (!key) diagnostics.push("/admin/rest/v1/me's first account had no usable `key` field");
  return key;
}

type Row = { label: string; value: string; ok: boolean; key: string };
type ListResult = { total: number; unhealthy: Row[] };

/** Phone numbers on the account, via the Voice Admin API's confirmed
 * /voice-admin/v1/phone-numbers endpoint (walking every page - see getAllPages).
 * Field names (`name`, `number`, `status`) match GoTo's documented example response;
 * `status`'s actual enum values are not documented, so anything outside
 * HEALTHY_STATUSES is flagged as a diagnostic rather than silently assumed to be
 * down. Only unhealthy numbers are returned as items - with a real account this can
 * be hundreds of numbers, and nobody needs every healthy one listed individually;
 * the total count still goes into the summary. */
async function fetchPhoneNumbers(accessToken: string, accountKey: string, diagnostics: string[]): Promise<ListResult> {
  const rows = await getAllPages(accessToken, `${VOICE_HOST}/voice-admin/v1/phone-numbers?accountKey=${encodeURIComponent(accountKey)}`, diagnostics);

  let unknownStatusSeen = false;
  const unhealthy: Row[] = [];
  rows.forEach((r, i) => {
    const status = typeof r.status === "string" ? r.status : undefined;
    const ok = status ? HEALTHY_STATUSES.has(status.toLowerCase()) : true;
    if (status && !ok) unknownStatusSeen = unknownStatusSeen || !HEALTHY_STATUSES.has(status.toLowerCase());
    if (ok) return;
    const number = (typeof r.number === "string" && r.number) || null;
    unhealthy.push({
      label: (typeof r.name === "string" && r.name) || number || "Phone number",
      value: status ?? "Unknown",
      ok: false,
      key: `phone:${number ?? i}`,
    });
  });
  if (unknownStatusSeen) {
    diagnostics.push(
      "One or more phone numbers reported a status not in this integration's known-healthy list - GoTo doesn't publish the full enum, " +
        "so check the value shown against your account and adjust HEALTHY_STATUSES in gotoConnect.ts if it's actually fine."
    );
  }
  return { total: rows.length, unhealthy };
}

/** Extensions on the account, via /voice-admin/v1/extensions (walking every page -
 * see getAllPages). The endpoint's existence and path are confirmed (it moved from
 * api.jive.com to api.goto.com along with the rest of the Voice Admin API), but
 * GoTo's public docs did not surface a documented response schema for it.
 * `status`/`phone.status` are a guess mirroring the phone numbers shape above; if an
 * account's real response uses something else, every extension looks "healthy" (no
 * status field means no health signal, not an assumed problem) rather than a wrong
 * guess - correct this against a real account's response. Only unhealthy extensions
 * are returned as items, same reasoning as fetchPhoneNumbers. */
async function fetchExtensions(accessToken: string, accountKey: string, diagnostics: string[]): Promise<ListResult> {
  const rows = await getAllPages(accessToken, `${VOICE_HOST}/voice-admin/v1/extensions?accountKey=${encodeURIComponent(accountKey)}`, diagnostics);

  let anyStatusFound = false;
  const unhealthy: Row[] = [];
  rows.forEach((r, i) => {
    const phone = r.phone as JsonRecord | undefined;
    const status = typeof r.status === "string" ? r.status : typeof phone?.status === "string" ? (phone.status as string) : undefined;
    if (status) anyStatusFound = true;
    const ok = status ? HEALTHY_STATUSES.has(status.toLowerCase()) : true;
    if (ok) return;
    const extension = (typeof r.extension === "string" && r.extension) || null;
    const label = (typeof r.name === "string" && r.name) || extension || (typeof r.number === "string" && r.number) || "Extension";
    unhealthy.push({ label, value: status ?? "Configured", ok: false, key: `ext:${extension ?? i}` });
  });
  if (rows.length > 0 && !anyStatusFound) {
    diagnostics.push(
      "Extensions API returned no field this integration recognizes as online/registered status (tried `status` and `phone.status`); " +
        "treating all extensions as healthy with no real health signal - see the UNCONFIRMED note in gotoConnect.ts."
    );
  }
  return { total: rows.length, unhealthy };
}

/**
 * Queries GoTo Connect's admin/voice APIs for phone-number and extension health: a
 * token exchange (PAT or refresh token, whichever is configured - see the file-level
 * comment) followed by the Voice Admin API's phone-numbers and extensions endpoints.
 */
export async function fetchGotoConnectStatus(config: Record<string, string>): Promise<IntegrationStatus> {
  const clientId = config.clientId?.trim();
  const clientSecret = config.clientSecret?.trim();
  const personalAccessToken = config.personalAccessToken?.trim();
  const refreshToken = config.refreshToken?.trim();

  if (!clientId || !clientSecret) {
    return {
      ok: false,
      error: "Client ID and Client Secret are required.",
      diagnostics: [],
      healthy: false,
      summary: "",
      items: [],
    };
  }
  if (personalAccessToken && refreshToken) {
    return {
      ok: false,
      error: "Provide either a Personal Access Token or a Refresh Token, not both.",
      diagnostics: [],
      healthy: false,
      summary: "",
      items: [],
    };
  }
  if (!personalAccessToken && !refreshToken) {
    return {
      ok: false,
      error: "Provide either a Personal Access Token or a Refresh Token.",
      diagnostics: [],
      healthy: false,
      summary: "",
      items: [],
    };
  }

  const diagnostics: string[] = [];
  try {
    const tokenResult = await getAccessToken(clientId, clientSecret, personalAccessToken ?? "", refreshToken ?? "");
    if (tokenResult.error !== null) throw new Error(tokenResult.error);
    const accessToken = tokenResult.token;

    const accountKey = await fetchAccountKey(accessToken, config.accountKey?.trim() ?? "", diagnostics);
    if (!accountKey) {
      throw new Error(diagnostics[diagnostics.length - 1] ?? "Could not determine a GoTo account key for this token");
    }

    const [phoneNumbers, extensions] = await Promise.all([
      fetchPhoneNumbers(accessToken, accountKey, diagnostics),
      fetchExtensions(accessToken, accountKey, diagnostics),
    ]);

    const items = [...phoneNumbers.unhealthy, ...extensions.unhealthy];
    const downCount = items.length;
    const healthy = downCount === 0;

    const parts: string[] = [];
    if (phoneNumbers.total) parts.push(`${phoneNumbers.total} phone number${phoneNumbers.total === 1 ? "" : "s"}`);
    if (extensions.total) parts.push(`${extensions.total} extension${extensions.total === 1 ? "" : "s"}`);
    const summary = parts.length
      ? `${parts.join(", ")}${downCount ? ` (${downCount} need attention)` : ""}`
      : "Connected to GoTo Connect, but no phone numbers or extensions were found";

    return { ok: true, healthy, summary, items, diagnostics };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Failed to query GoTo Connect",
      diagnostics,
      healthy: false,
      summary: "",
      items: [],
    };
  }
}

/**
 * Sends an SMS from a GoTo Connect phone number to an arbitrary destination number,
 * used as an outbound notification channel (see lib/notifier.ts) alongside
 * subscriber email and the Slack/Discord/generic webhook - the FROM number is this
 * target's own smsFromNumber field (see lib/integrationCatalogMeta.ts), the TO
 * number is passed in by the caller (either this target's fixed smsToNumber for the
 * admin-configured alert, or a phone number someone subscribed with).
 *
 * CONFIRMED against https://developer.goto.com/guides/GoToConnect/12_Send_SMS/ :
 * POST https://api.goto.com/messaging/v1/messages with body
 * { ownerPhoneNumber, contactPhoneNumbers: [...], body }, needing the
 * `messaging.v1.send` OAuth scope. That scope is almost certainly NOT already
 * enabled on an existing GoTo OAuth Client set up only for the Voice Admin health
 * check (which needs `voice-admin.v1.read`) - it must be added at
 * https://developer.logmeininc.com/clients for this to work, the same one-time step
 * already needed there for the Personal Access Token grant type (see the file-level
 * comment above).
 */
export async function sendGotoConnectSms(
  config: Record<string, string>,
  toNumber: string,
  message: string
): Promise<{ ok: boolean; error?: string }> {
  const clientId = config.clientId?.trim();
  const clientSecret = config.clientSecret?.trim();
  const personalAccessToken = config.personalAccessToken?.trim();
  const refreshToken = config.refreshToken?.trim();
  const fromNumber = config.smsFromNumber?.trim();

  if (!clientId || !clientSecret || (!personalAccessToken && !refreshToken)) {
    return { ok: false, error: "GoTo Connect is not configured with credentials." };
  }
  if (!fromNumber || !toNumber) {
    return { ok: false, error: "SMS From number is not configured for this GoTo Connect target, or no destination number was given." };
  }

  const tokenResult = await getAccessToken(clientId, clientSecret, personalAccessToken ?? "", refreshToken ?? "");
  if (tokenResult.error !== null) {
    return { ok: false, error: tokenResult.error };
  }

  try {
    const res = await undiciFetch(`${VOICE_HOST}/messaging/v1/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${tokenResult.token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ ownerPhoneNumber: fromNumber, contactPhoneNumbers: [toNumber], body: message }),
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return { ok: false, error: `Messaging API returned HTTP ${res.status}${text ? `: ${text.slice(0, 200)}` : ""}` };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Failed to send SMS" };
  }
}
