import { fetch as undiciFetch } from "undici";
import type { IntegrationStatus } from "./types";

/**
 * GoTo Connect (formerly Jive/LogMeIn) admin/voice APIs for a customer's own hosted
 * phone system -- NOT the public status.goto.com feed, which this app surfaces as its
 * own separate "GoTo Status" integration.
 *
 * This is a server-side background poller with no user present to run an interactive
 * OAuth consent flow, so `config` supports two mutually exclusive ways to authenticate
 * -- an admin fills in exactly one, not both:
 *   - Personal Access Token (PAT): self-service, created once at
 *     https://myaccount.goto.com -> Developer Tools -> Create token, no
 *     authorization-code round trip required. The OAuth Client itself still needs the
 *     "Personal Access Token" grant type toggled on at
 *     https://developer.logmeininc.com/clients. Simpler to set up; prefer this unless
 *     there's a reason not to.
 *   - Refresh token: a long-lived token obtained once, out of band, via GoTo's OAuth
 *     authorization-code flow -- useful when PAT creation isn't available/allowed for
 *     an account.
 * Every call exchanges whichever one is configured for a short-lived access token
 * (personal_access_token or refresh_token grant, respectively); clientId/clientSecret
 * are required either way.
 *
 * Endpoints/fields below were checked against GoTo's current developer docs at
 * https://developer.goto.com/ (mid-2026):
 *   - PAT exchange: https://developer.goto.com/guides/Authentication/03.1_HOW_accessTokenPAT/
 *     -- CONFIRMED: POST to authentication.logmeininc.com/oauth/token, Basic auth of
 *     clientId:clientSecret, grant_type=personal_access_token&pat=<token>. Response is a
 *     normal OAuth token response (access_token, expires_in ~3600s). (The older
 *     api.getgo.com/oauth/v2 token host from GoTo's own older guides was decommissioned
 *     September 30, 2025.)
 *   - Refresh token exchange: https://developer.goto.com/guides/Authentication/05_HOW_refreshToken/
 *     -- CONFIRMED: same token endpoint, grant_type=refresh_token&refresh_token=<token>.
 *     GoTo may rotate the refresh token itself on use, returning a new one alongside
 *     the access token -- this integration has no way to persist that back to `config`,
 *     so if a previously-working refresh token starts being rejected, the fix is
 *     re-running the authorization-code flow for a fresh one (or switching to a PAT).
 *   - Account key lookup: https://developer.goto.com/guides/GoToConnect/09_HOW_fetchAccountUsers/
 *     -- CONFIRMED: GET api.getgo.com/admin/rest/v1/me returns the accounts this token
 *     can act on; their `key` is the accountKey every Voice Admin API call needs.
 *   - Voice Admin API (phone numbers): https://developer.goto.com/guides/GoToConnect/13_HOW_useVoiceAdminApis/
 *     -- CONFIRMED endpoint/shape: GET api.goto.com/voice-admin/v1/phone-numbers, scope
 *     voice-admin.v1.read. GoTo's changelog notes this response now includes a `status`
 *     field per number, but does not document its enum values, so it's shown verbatim
 *     rather than mapped to ok/not-ok beyond a short guess list (see HEALTHY_STATUSES).
 *   - Voice Admin API (extensions): confirmed to exist and to have moved from
 *     api.jive.com to api.goto.com (same /voice-admin/v1/extensions path), but GoTo's
 *     public docs did not turn up a documented response schema for it -- in particular
 *     there's no confirmed field for "is this extension's phone actually registered".
 *     fetchExtensions() below guesses at `status`/`phone.status` (mirroring the phone
 *     numbers shape) and falls back to listing extensions as configured, with no
 *     health signal, if neither is present. Treat this endpoint's mapping as the least
 *     trustworthy part of this file and correct it against a real account's response.
 *
 * Unlike a refresh token, GoTo's docs don't describe the PAT itself rotating on use --
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

/** Best-guess "this row looks healthy" values -- GoTo doesn't publish the enum for
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

/** Every Voice Admin API call is scoped to an accountKey, resolved from whichever
 * GoTo accounts this token's owner belongs to. If there's more than one (e.g. a
 * reseller/multi-tenant login), the first is used and a diagnostic notes the choice --
 * there's no field in `config` today to pin a specific one. */
async function fetchAccountKey(accessToken: string, diagnostics: string[]): Promise<string | null> {
  const result = await get(accessToken, `${ADMIN_HOST}/admin/rest/v1/me`);
  if (result.error !== null) {
    diagnostics.push(result.error);
    return null;
  }
  const accounts = Array.isArray(result.data.accounts) ? (result.data.accounts as JsonRecord[]) : [];
  const firstAccount = accounts[0];
  if (!firstAccount) {
    diagnostics.push("/admin/rest/v1/me returned no accounts for this token");
    return null;
  }
  if (accounts.length > 1) {
    diagnostics.push(
      `This token has access to ${accounts.length} GoTo accounts; using the first (${String(firstAccount.name ?? firstAccount.key)}). ` +
        "There's currently no config field to pin a different one."
    );
  }
  const key = firstAccount.key;
  if (typeof key === "string") return key;
  if (typeof key === "number") return String(key);
  diagnostics.push("/admin/rest/v1/me's first account had no usable `key` field");
  return null;
}

type Row = { label: string; value: string; ok: boolean };

/** Phone numbers on the account, via the Voice Admin API's confirmed
 * /voice-admin/v1/phone-numbers endpoint. Field names (`name`, `number`, `status`)
 * match GoTo's documented example response; `status`'s actual enum values are not
 * documented, so anything outside HEALTHY_STATUSES is flagged as a diagnostic rather
 * than silently assumed to be down. */
async function fetchPhoneNumbers(accessToken: string, accountKey: string, diagnostics: string[]): Promise<Row[]> {
  const result = await get(accessToken, `${VOICE_HOST}/voice-admin/v1/phone-numbers?accountKey=${encodeURIComponent(accountKey)}`);
  if (result.error !== null) {
    diagnostics.push(result.error);
    return [];
  }
  if (typeof result.data.nextPageMarker === "string" && result.data.nextPageMarker) {
    diagnostics.push("Phone numbers list is paginated (nextPageMarker present) -- only the first page is shown here.");
  }
  const rows = Array.isArray(result.data.items) ? (result.data.items as JsonRecord[]) : [];

  let unknownStatusSeen = false;
  const items = rows.map((r): Row => {
    const status = typeof r.status === "string" ? r.status : undefined;
    if (status && !HEALTHY_STATUSES.has(status.toLowerCase())) unknownStatusSeen = true;
    return {
      label: (typeof r.name === "string" && r.name) || (typeof r.number === "string" && r.number) || "Phone number",
      value: status ?? "Unknown",
      ok: status ? HEALTHY_STATUSES.has(status.toLowerCase()) : true,
    };
  });
  if (unknownStatusSeen) {
    diagnostics.push(
      "One or more phone numbers reported a status not in this integration's known-healthy list -- GoTo doesn't publish the full enum, " +
        "so check the value shown against your account and adjust HEALTHY_STATUSES in gotoConnect.ts if it's actually fine."
    );
  }
  return items;
}

/** Extensions on the account, via /voice-admin/v1/extensions. The endpoint's existence
 * and path are confirmed (it moved from api.jive.com to api.goto.com along with the
 * rest of the Voice Admin API), but GoTo's public docs did not surface a documented
 * response schema for it. `status`/`phone.status` are a guess mirroring the phone
 * numbers shape above; if an account's real response uses something else, every
 * extension will just show as "Configured" (no health signal) rather than a wrong
 * guess -- correct this against a real account's response. */
async function fetchExtensions(accessToken: string, accountKey: string, diagnostics: string[]): Promise<Row[]> {
  const result = await get(accessToken, `${VOICE_HOST}/voice-admin/v1/extensions?accountKey=${encodeURIComponent(accountKey)}`);
  if (result.error !== null) {
    diagnostics.push(result.error);
    return [];
  }
  const rows = Array.isArray(result.data.items) ? (result.data.items as JsonRecord[]) : [];

  let anyStatusFound = false;
  const items = rows.map((r): Row => {
    const phone = r.phone as JsonRecord | undefined;
    const status = typeof r.status === "string" ? r.status : typeof phone?.status === "string" ? (phone.status as string) : undefined;
    if (status) anyStatusFound = true;
    const label =
      (typeof r.name === "string" && r.name) ||
      (typeof r.extension === "string" && r.extension) ||
      (typeof r.number === "string" && r.number) ||
      "Extension";
    return {
      label,
      value: status ?? "Configured",
      ok: status ? HEALTHY_STATUSES.has(status.toLowerCase()) : true,
    };
  });
  if (rows.length > 0 && !anyStatusFound) {
    diagnostics.push(
      "Extensions API returned no field this integration recognizes as online/registered status (tried `status` and `phone.status`); " +
        "listing extensions as configured only, with no real health signal -- see the UNCONFIRMED note in gotoConnect.ts."
    );
  }
  return items;
}

/**
 * Queries GoTo Connect's admin/voice APIs for phone-number and extension health: a
 * token exchange (PAT or refresh token, whichever is configured -- see the file-level
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
    const tokenResult = personalAccessToken
      ? await exchangePersonalAccessToken(clientId, clientSecret, personalAccessToken)
      : await exchangeRefreshToken(clientId, clientSecret, refreshToken!);
    if (tokenResult.error !== null) throw new Error(tokenResult.error);
    const accessToken = tokenResult.token;

    const accountKey = await fetchAccountKey(accessToken, diagnostics);
    if (!accountKey) {
      throw new Error(diagnostics[diagnostics.length - 1] ?? "Could not determine a GoTo account key for this token");
    }

    const [phoneNumbers, extensions] = await Promise.all([
      fetchPhoneNumbers(accessToken, accountKey, diagnostics),
      fetchExtensions(accessToken, accountKey, diagnostics),
    ]);

    const items = [...phoneNumbers, ...extensions];
    const downCount = items.filter((i) => !i.ok).length;
    const healthy = downCount === 0;

    const parts: string[] = [];
    if (phoneNumbers.length) parts.push(`${phoneNumbers.length} phone number${phoneNumbers.length === 1 ? "" : "s"}`);
    if (extensions.length) parts.push(`${extensions.length} extension${extensions.length === 1 ? "" : "s"}`);
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
