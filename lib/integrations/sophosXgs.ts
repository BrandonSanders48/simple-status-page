import { fetch as undiciFetch } from "undici";
import { insecureAgent } from "@/lib/insecureAgent";
import type { IntegrationStatus } from "./types";

/**
 * Sophos Firewall (XGS on-prem appliance, SFOS firmware -- NOT Sophos Central cloud
 * management, which has its own bearer-token REST API at developer.sophos.com and is
 * handled by a separate integration).
 *
 * API SHAPE CHOSEN: the legacy XML "APIController" endpoint, not REST/JSON.
 *
 * Verified via docs.sophos.com (SFOS 18.5 through 22.0) and the Sophos community: SFOS
 * only exposes one management API on the appliance itself -- an XML payload POSTed (or
 * GETed) to https://<device>:4444/webconsole/APIController, with the admin username and
 * password embedded in a <Login> block on *every* request (no separate login call, no
 * session/bearer token). This has not changed across firmware versions up to 22.0 --
 * every version's docs describe the same <Request><Login>...</Login><Get>...</Get>
 * </Request> shape. The REST/bearer-token "Firewall Management API" advertised at
 * developer.sophos.com/firewall-management is a Sophos Central product (Authorization:
 * Bearer <jwt> + X-Tenant-ID, reached via Central's cloud endpoints) for firewalls
 * centrally managed through Central -- it does not apply to hitting an XGS box's own
 * management IP directly, which is what this integration needs, so it was not used
 * here. Given that, this integration builds/parses the XML API by hand (no XML parser
 * dependency exists in this project) rather than leaving REST support half-implemented.
 *
 * WHAT'S CONFIRMED vs BEST-GUESS (please sanity-check against a real appliance):
 * - Endpoint, port (4444 default), and the <Request><Login><Username>/<Password></Login>
 *   envelope: confirmed across multiple SFOS doc versions and community examples.
 * - The <Login> success/failure signal: community reports show both a child
 *   `<status>Authentication Successful|Failure</status>` tag AND (per other reports) a
 *   `status="..."` attribute on <Login> -- since the exact shape wasn't pinned down
 *   from docs alone, loginStatusOf() below checks both forms defensively.
 * - `SystemServices` as a Get entity returning per-service Action/Status for AntiSpam,
 *   AntiVirus, Authentication, DHCPServer, DNSServer, IPS, WebProxy: confirmed from a
 *   real example XML request/response shared on the Sophos community (not from official
 *   docs, which don't list it in the entity index -- that index is almost entirely
 *   Add/Edit/Delete config CRUD). The exact literal values of each <Status> (e.g.
 *   "Start"/"Stop" vs "Running"/"Stopped") are NOT confirmed, so it's matched loosely
 *   (see isServiceDown below) rather than against one exact string.
 * - `VPNIPSecConnection` as the entity name for IPsec connections: confirmed (it's the
 *   literal XML tag used in both the official Add/Edit docs and a community-posted
 *   <Set> example). Its <Configuration><Status>Active|Deactive</Status></Configuration>
 *   field is confirmed too, but it is the *admin enabled/disabled* flag, not a live
 *   tunnel-up/down signal -- Sophos's own webadmin UI has a separate "Connection status"
 *   column (Established/Not Established/Partial) for that, and multiple community
 *   threads (as recently as SFOS 20) indicate live tunnel state has historically NOT
 *   been exposed through this API, only through the UI/CLI (`ipsec statusall`) or SNMP.
 *   This integration still defensively probes a handful of plausible live-status tag
 *   names (ConnectionStatus/TunnelStatus/LiveConnectionStatus/LiveStatus) in case a
 *   newer firmware version added one as a sibling of <Configuration>, and prefers that
 *   over the admin flag when found -- but on firmware where it's absent (the common
 *   case per available evidence), VPN rows fall back to reporting the enabled/disabled
 *   config state only, clearly labeled as such, and are NOT treated as a health failure
 *   on their own (see fetchVpnConnections below).
 * - CPU/memory/disk and alerts/events: intentionally NOT implemented. No documented (or
 *   community-confirmed) Get entity exposes live resource usage or an alert/event feed
 *   through this on-box XML API -- the entity index is configuration-only, and the
 *   alerts/events APIs that do exist (developer.sophos.com) belong to Sophos Central,
 *   out of scope here. Per this project's own convention, usage percentages shouldn't
 *   drive `healthy` anyway, so this isn't a loss for the health signal -- SystemServices
 *   (a real up/down signal) is used instead.
 * - HA (active/passive) role/status: also NOT implemented -- the only documented `HA`
 *   entity is configuration (enable/disable HA, ports, etc.), and no confirmed Get
 *   response field for live HA role (Primary/Auxiliary/Faulty) was found in research.
 */

interface SophosXgsConfig {
  host: string;
  username: string;
  password: string;
}

type StatusRow = { label: string; value: string; ok: boolean };

type ApiResult = { ok: true; xml: string } | { ok: false; error: string; authFailure: boolean };

/** Builds the admin console API URL. `host` may or may not include a scheme and/or
 * port -- defaults to https:// and port 4444 (the documented default admin/API port)
 * when not given. */
function apiUrl(host: string): string {
  const trimmed = host.trim();
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  let url: URL;
  try {
    url = new URL(withScheme);
  } catch {
    url = new URL(`https://${trimmed.replace(/\/.*$/, "")}`);
  }
  if (!url.port) url.port = "4444";
  url.pathname = "/webconsole/APIController";
  url.search = "";
  return url.toString();
}

function xmlEscape(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** First match of <tag ...>...</tag> (case-insensitive, not anchored), or null. Used to
 * scope subsequent lookups to a sub-block rather than the whole document, since tag
 * names like "Status" recur at multiple nesting levels. */
function getTagContent(xml: string, tag: string): string | null {
  const match = xml.match(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`, "i"));
  return match ? match[1] ?? null : null;
}

/** Every top-level occurrence of <tag>...</tag> (repeated entity blocks, e.g. one per
 * configured VPN connection). */
function getAllBlocks(xml: string, tag: string): string[] {
  const re = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`, "gi");
  const blocks: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = re.exec(xml))) blocks.push(match[1] ?? "");
  return blocks;
}

/** Checks both plausible shapes for the Login result -- a child `<status>` tag or a
 * `status="..."` attribute on `<Login>` -- since the exact shape isn't pinned down from
 * available docs/examples (see file-level comment). Returns null if neither is found
 * (unexpected response shape -- treated as a request error by the caller, not a crash). */
function loginStatusOf(xml: string): string | null {
  const childTag = xml.match(/<Login[^>]*>[\s\S]*?<status>([\s\S]*?)<\/status>/i);
  if (childTag && childTag[1] !== undefined) return childTag[1].trim();
  const attr = xml.match(/<Login[^>]*\bstatus="([^"]*)"/i);
  if (attr && attr[1] !== undefined) return attr[1].trim();
  return null;
}

/**
 * POSTs one <Request><Login>...</Login>{innerXml}</Request> payload and returns the raw
 * response body for regex-based extraction (no XML parser dependency in this project).
 * Never throws -- network/timeout/HTTP failures and login failures all come back as
 * `{ ok: false, error }` so a caller's Promise.all never rejects.
 */
async function callApi(cfg: SophosXgsConfig, innerXml: string, timeoutMs = 8000): Promise<ApiResult> {
  const reqXml = `<Request><Login><Username>${xmlEscape(cfg.username)}</Username><Password>${xmlEscape(cfg.password)}</Password></Login>${innerXml}</Request>`;
  try {
    const res = await undiciFetch(apiUrl(cfg.host), {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: `reqxml=${encodeURIComponent(reqXml)}`,
      dispatcher: insecureAgent,
      signal: AbortSignal.timeout(timeoutMs),
    });
    const text = await res.text().catch(() => "");
    if (!res.ok) {
      return { ok: false, error: `APIController returned HTTP ${res.status}${text ? `: ${text.slice(0, 200)}` : ""}`, authFailure: false };
    }
    const status = loginStatusOf(text);
    if (status && !/success/i.test(status)) {
      return { ok: false, error: `Login failed: ${status}`, authFailure: true };
    }
    return { ok: true, xml: text };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "request failed", authFailure: false };
  }
}

/** AntiSpam/AntiVirus/etc. Status values aren't confirmed as one exact string (docs
 * don't show them; only a community example confirms the entity/field names exist at
 * all) -- so "down" is matched loosely against common stop/fail wording rather than one
 * literal, and anything else is treated as healthy/running. */
function isServiceDown(statusText: string): boolean {
  return /\b(stop|stopped|disabled|down|fail|failed|inactive)\b/i.test(statusText);
}

const KNOWN_SYSTEM_SERVICES = ["AntiVirus", "AntiSpam", "Authentication", "DHCPServer", "DNSServer", "IPS", "WebProxy"];

/** Per-service running/stopped state from the `SystemServices` entity -- a genuine
 * up/down signal (unlike a CPU/disk percentage), used for the `healthy` rollup. See the
 * file-level comment for how confirmed this entity is. */
async function fetchSystemServices(cfg: SophosXgsConfig, diagnostics: string[]): Promise<StatusRow[]> {
  const result = await callApi(cfg, "<Get><SystemServices></SystemServices></Get>");
  if (!result.ok) {
    diagnostics.push(`SystemServices: ${result.error}`);
    return [];
  }

  const block = getTagContent(result.xml, "SystemServices");
  if (block === null) {
    diagnostics.push("SystemServices: response did not include a <SystemServices> block -- this firmware/account may not support the entity, or expose it under a different tag.");
    return [];
  }

  const rows: StatusRow[] = [];
  for (const service of KNOWN_SYSTEM_SERVICES) {
    const serviceBlock = getTagContent(block, service);
    if (serviceBlock === null) continue; // Not present -- likely just not licensed/enabled on this box, not an error.
    const statusText = (getTagContent(serviceBlock, "Status") ?? serviceBlock).trim();
    rows.push({ label: `Service: ${service}`, value: statusText || "Unknown", ok: statusText ? !isServiceDown(statusText) : true });
  }
  return rows;
}

const LIVE_VPN_STATUS_TAGS = ["ConnectionStatus", "TunnelStatus", "LiveConnectionStatus", "LiveStatus"];

/**
 * IPsec VPN connections via the `VPNIPSecConnection` entity. Prefers a live tunnel-state
 * field if the firmware happens to expose one (see LIVE_VPN_STATUS_TAGS and the
 * file-level comment on why this is a defensive probe, not a confirmed field), and falls
 * back to the confirmed admin enabled/disabled flag (<Configuration><Status>) when no
 * live field is found. The fallback is informational only (`ok: true`) rather than
 * driving `healthy`, because "Active" only means "an admin turned this on", not "the
 * tunnel is actually up" -- reporting a real tunnel outage as a failure requires a field
 * this integration could not confirm exists on your firmware; check `diagnostics` and,
 * if you find the real field name on your box, this is the place to wire it in.
 */
async function fetchVpnConnections(cfg: SophosXgsConfig, diagnostics: string[]): Promise<StatusRow[]> {
  const result = await callApi(cfg, "<Get><VPNIPSecConnection></VPNIPSecConnection></Get>");
  if (!result.ok) {
    diagnostics.push(`VPNIPSecConnection: ${result.error}`);
    return [];
  }

  const blocks = getAllBlocks(result.xml, "VPNIPSecConnection");
  if (blocks.length === 0) return []; // Genuinely means "no IPsec connections configured" -- not an error.

  const rows: StatusRow[] = [];
  let usedFallback = false;

  for (const entryXml of blocks) {
    const config = getTagContent(entryXml, "Configuration") ?? entryXml;
    const name = getTagContent(config, "Name")?.trim() || "Unnamed connection";

    let liveStatus: string | null = null;
    for (const tag of LIVE_VPN_STATUS_TAGS) {
      const value = getTagContent(entryXml, tag);
      if (value !== null) {
        liveStatus = value.trim();
        break;
      }
    }

    if (liveStatus) {
      const down = /\b(not[\s-]?established|down|disconnect|disconnected|inactive|fail|failed)\b/i.test(liveStatus);
      rows.push({ label: `VPN: ${name}`, value: liveStatus, ok: !down });
      continue;
    }

    const adminStatus = getTagContent(config, "Status")?.trim();
    if (adminStatus) {
      usedFallback = true;
      const disabled = /deactive|inactive|disable/i.test(adminStatus);
      rows.push({ label: `VPN: ${name}`, value: disabled ? "Disabled" : "Enabled", ok: true });
    } else {
      rows.push({ label: `VPN: ${name}`, value: "Unknown", ok: true });
      diagnostics.push(`VPNIPSecConnection "${name}": no recognizable status field found.`);
    }
  }

  if (usedFallback) {
    diagnostics.push(
      "VPNIPSecConnection: no live tunnel-state field was found (checked ConnectionStatus/TunnelStatus/LiveConnectionStatus/LiveStatus) -- VPN rows show the configured enabled/disabled flag only, not whether the tunnel is actually up. This appears to be a real limitation of the on-box XML API on most firmware versions; a genuine tunnel outage may not be reflected here."
    );
  }

  return rows;
}

/**
 * Queries a Sophos Firewall (XGS) appliance's on-box XML management API for service
 * health (SystemServices) and configured IPsec VPN connections (VPNIPSecConnection).
 * See the file-level comment above for the API shape decision and exactly what's
 * confirmed vs best-guess.
 */
export async function fetchSophosXgsStatus(config: Record<string, string>): Promise<IntegrationStatus> {
  const host = config.host?.trim();
  const username = config.username?.trim();
  const password = config.password;

  if (!host || !username || !password) {
    return { ok: false, error: "Host, username, and password are required.", diagnostics: [], healthy: false, summary: "", items: [] };
  }

  const cfg: SophosXgsConfig = { host, username, password };
  const diagnostics: string[] = [];

  try {
    const [services, vpns] = await Promise.all([fetchSystemServices(cfg, diagnostics), fetchVpnConnections(cfg, diagnostics)]);

    // Both fetches above catch their own errors (login failure, timeout, unreachable
    // host) into `diagnostics` and return [] rather than throwing -- matching this
    // project's convention (see proxmox.ts/powerstore.ts) -- which means a total
    // connection failure would otherwise land here looking identical to "reachable, but
    // nothing configured". Treat "nothing came back at all, and something was logged"
    // as the strong signal the appliance was never actually reached.
    if (services.length === 0 && vpns.length === 0 && diagnostics.length > 0) {
      return { ok: false, error: diagnostics[0], diagnostics, healthy: false, summary: "", items: [] };
    }

    const items = [...services, ...vpns];
    const badCount = items.filter((item) => !item.ok).length;
    const summary =
      items.length === 0
        ? "Connected, but no services or IPsec VPN connections were returned."
        : badCount > 0
          ? `${badCount} of ${items.length} checked item(s) reporting a problem`
          : `${items.length} item(s) checked, all healthy`;

    return { ok: true, diagnostics, healthy: badCount === 0, summary, items };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Failed to query Sophos Firewall",
      diagnostics,
      healthy: false,
      summary: "",
      items: [],
    };
  }
}
