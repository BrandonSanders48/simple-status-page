import { fetch as undiciFetch } from "undici";
import type { IntegrationStatus } from "./types";

/**
 * Cisco Meraki Dashboard API -- cloud-managed switches/APs/security appliances/etc.
 * Auth is a single admin-scoped API key (Dashboard > Organization > API & Webhooks),
 * sent on every request via the `X-Cisco-Meraki-API-Key` header (the Dashboard API
 * also accepts `Authorization: Bearer <key>`; the older header name is used here since
 * it's been stable the longest and needs no extra explanation in the admin form).
 *
 * Endpoints/fields below were checked against developer.cisco.com/meraki/api-v1/
 * (mid-2026):
 *   - GET /organizations -- CONFIRMED: lists every organization this key can access,
 *     each with an `id`/`name`. Always fetched (see resolveOrganizationId) -- even
 *     when `organizationId` is configured -- purely so a diagnostic can report which
 *     org name actually got queried and what else this key can see, since "connected
 *     fine, 0 devices" and "queried the wrong/empty org" look identical otherwise.
 *     Falls back to auto-picking the first org when `organizationId` is blank,
 *     mirroring this app's GoTo Connect accountKey auto-detect.
 *   - GET /organizations/{organizationId}/devices/availabilities -- CONFIRMED as the
 *     current (non-deprecated) endpoint for device status: the older
 *     /devices/statuses endpoint was marked deprecated in the docs as of October 2024
 *     in favor of this one. Each entry has `name`, `serial`, `productType`, and a
 *     `status` of "online"/"alerting"/"offline"/"dormant" -- refreshed by Meraki every
 *     5 minutes per the docs, so don't expect faster-than-that granularity. Only the
 *     first page (up to 1000 devices, the API's max perPage) is requested; an org with
 *     more devices than that will only show the first 1000, noted in `diagnostics`.
 *   - GET /organizations/{organizationId}/assurance/alerts -- MEDIUM confidence only:
 *     this is Meraki's "Alert Hub"/health-alerts API, which is where the *reason* a
 *     device is "alerting" actually lives (devices/availabilities only gives the bare
 *     status word). Confirmed to exist and return alert rows with an id/categoryType/
 *     startedAt/resolvedAt, but the exact field linking an alert to a specific device
 *     (serial vs a nested device object) wasn't pinned down from docs alone -- see
 *     deviceSerialOf() below, which defensively probes several plausible shapes rather
 *     than assuming one. If a device shows "Alerting" with no extra detail in
 *     parentheses, check `diagnostics`: either this endpoint returned nothing useful
 *     for that serial, or the field-probing here needs correcting against a real
 *     account's response. A failure calling this endpoint at all never fails the whole
 *     integration -- devices just show the bare status word, as before.
 *
 * Status mapping: "online" is healthy, "offline"/"alerting" are not, and "dormant"
 * (configured but not actively deployed/claimed into a network) is shown neutrally --
 * same tri-state convention as this app's UniFi integration for a subsystem that isn't
 * really in use, not a real failure.
 */

type JsonRecord = Record<string, unknown>;
type FetchResult = { data: unknown; error: null } | { data: null; error: string };

const API_BASE = "https://api.meraki.com/api/v1";

async function get(apiKey: string, path: string, timeoutMs = 8000): Promise<FetchResult> {
  try {
    const res = await undiciFetch(`${API_BASE}${path}`, {
      headers: { "X-Cisco-Meraki-API-Key": apiKey, Accept: "application/json" },
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

/**
 * Resolves which organization to query -- always fetches /organizations first (even
 * when `configured` is set) so a diagnostic can always say exactly which org name/id
 * ended up being queried, plus every other org this key can see. This is the single
 * biggest source of "connected fine, but 0 devices" confusion: an org that's actually
 * empty (or the wrong one, picked automatically because Organization ID was left
 * blank) looks identical to a real problem without this cross-check.
 */
async function resolveOrganizationId(apiKey: string, configured: string, diagnostics: string[]): Promise<string | null> {
  const result = await get(apiKey, "/organizations");
  if (result.error !== null) {
    diagnostics.push(result.error);
    // Still try the configured id even if listing organizations failed (e.g. a key
    // scoped to exactly one org sometimes can't list orgs, only query them directly).
    return configured || null;
  }
  const orgs = Array.isArray(result.data) ? (result.data as JsonRecord[]) : [];
  const describe = (o: JsonRecord) => `${String(o.name ?? "unnamed")} [${String(o.id)}]`;

  if (configured) {
    const match = orgs.find((o) => String(o.id) === configured);
    if (match) {
      diagnostics.push(`Querying organization ${describe(match)}.`);
    } else {
      diagnostics.push(
        `Configured Organization ID "${configured}" was not found among the ${orgs.length} organization(s) this API key can see` +
          (orgs.length > 0 ? ` (${orgs.map(describe).join(", ")})` : "") +
          " -- double-check it against Meraki Dashboard > Organization > Settings. Querying it anyway in case this key can see it but not list it."
      );
    }
    return configured;
  }

  const first = orgs[0];
  if (!first) {
    diagnostics.push("/organizations returned no organizations for this API key");
    return null;
  }
  diagnostics.push(
    `Querying organization ${describe(first)}` +
      (orgs.length > 1
        ? ` -- this key can see ${orgs.length} organizations total (${orgs.map(describe).join(", ")}); set Organization ID in the integration's config to pin a different one.`
        : ".")
  );
  return typeof first.id === "string" ? first.id : null;
}

type Row = { label: string; value: string; ok: boolean | null; key: string };

const STATUS_LABEL: Record<string, string> = { online: "Online", offline: "Offline", alerting: "Alerting", dormant: "Dormant" };

/** Best-effort extraction of which device serial an assurance alert row is about --
 * tries every plausible shape rather than assuming one, since this wasn't confirmed
 * from docs alone (see the file-level comment). Returns null if none match, in which
 * case the alert is simply not used (not an error). */
function deviceSerialOf(alert: JsonRecord): string | null {
  const device = alert.device as JsonRecord | undefined;
  const candidates = [alert.deviceSerial, alert.serial, device?.serial];
  const found = candidates.find((c) => typeof c === "string" && c.length > 0);
  return typeof found === "string" ? found : null;
}

/** A short human reason for an assurance alert row -- prefers a title-like field,
 * falls back to the alert's category. */
function describeAlert(alert: JsonRecord): string | null {
  const text = alert.title ?? alert.type ?? alert.categoryType;
  return typeof text === "string" && text.length > 0 ? text : null;
}

/**
 * Maps each alerting device's serial to a short reason via the Assurance Alerts API,
 * so a device can show e.g. "Alerting (Gateway unreachable)" instead of just
 * "Alerting". Never throws and never fails the caller -- any problem here (wrong
 * endpoint shape, request error) just means devices fall back to the bare status
 * word, noted in `diagnostics` rather than surfaced as a hard failure.
 */
async function fetchAlertReasons(apiKey: string, organizationId: string, diagnostics: string[]): Promise<Map<string, string>> {
  const reasons = new Map<string, string>();
  const result = await get(apiKey, `/organizations/${encodeURIComponent(organizationId)}/assurance/alerts`);
  if (result.error !== null) {
    diagnostics.push(`assurance/alerts (device alert detail): ${result.error}`);
    return reasons;
  }
  const body = result.data as { items?: unknown };
  const alerts = Array.isArray(result.data) ? (result.data as JsonRecord[]) : Array.isArray(body?.items) ? (body.items as JsonRecord[]) : [];

  let unmatched = 0;
  for (const alert of alerts) {
    if (typeof alert.resolvedAt === "string" && alert.resolvedAt) continue; // already resolved -- not a current reason
    const serial = deviceSerialOf(alert);
    const reason = describeAlert(alert);
    if (!serial || !reason) {
      unmatched++;
      continue;
    }
    if (!reasons.has(serial)) reasons.set(serial, reason);
  }
  if (alerts.length > 0 && reasons.size === 0) {
    diagnostics.push(
      `assurance/alerts: got ${alerts.length} alert(s) but couldn't match any to a device serial or reason -- ` +
        `field-probing in deviceSerialOf()/describeAlert() likely needs correcting against this account's actual response shape.`
    );
  } else if (unmatched > 0) {
    diagnostics.push(`assurance/alerts: ${unmatched} alert(s) couldn't be matched to a device/reason and were skipped.`);
  }
  return reasons;
}

async function fetchDeviceAvailabilities(apiKey: string, organizationId: string, diagnostics: string[]): Promise<Row[]> {
  const [devicesResult, alertReasons] = await Promise.all([
    get(apiKey, `/organizations/${encodeURIComponent(organizationId)}/devices/availabilities?perPage=1000`),
    fetchAlertReasons(apiKey, organizationId, diagnostics),
  ]);
  if (devicesResult.error !== null) {
    diagnostics.push(devicesResult.error);
    return [];
  }
  const devices = Array.isArray(devicesResult.data) ? (devicesResult.data as JsonRecord[]) : [];
  if (devices.length === 1000) {
    diagnostics.push("This organization has 1000+ devices -- only the first 1000 (one API page) are shown here.");
  }

  return devices.map((d, i): Row => {
    const rawStatus = typeof d.status === "string" ? d.status : "";
    const status = rawStatus.toLowerCase();
    const serial = typeof d.serial === "string" ? d.serial : null;
    const label = (typeof d.name === "string" && d.name) || serial || "Device";
    const ok = status === "dormant" ? null : status === "online";
    const statusText = STATUS_LABEL[status] || rawStatus || "Unknown";
    const reason = status !== "online" && serial ? alertReasons.get(serial) : undefined;
    return { label, value: reason ? `${statusText} (${reason})` : statusText, ok, key: serial ?? `device:${i}` };
  });
}

/**
 * Queries the Cisco Meraki Dashboard API for organization device availability (online/
 * offline/alerting/dormant) across every network in the org. See the file-level
 * comment for exactly which endpoints this uses and why.
 */
export async function fetchMerakiStatus(config: Record<string, string>): Promise<IntegrationStatus> {
  const apiKey = config.apiKey?.trim();
  if (!apiKey) {
    return { ok: false, error: "API Key is required.", diagnostics: [], healthy: false, summary: "", items: [] };
  }

  const diagnostics: string[] = [];
  try {
    const organizationId = await resolveOrganizationId(apiKey, config.organizationId?.trim() ?? "", diagnostics);
    if (!organizationId) {
      throw new Error(diagnostics[diagnostics.length - 1] ?? "Could not determine a Meraki organization for this API key");
    }

    const items = await fetchDeviceAvailabilities(apiKey, organizationId, diagnostics);
    const downCount = items.filter((i) => i.ok === false).length;
    const healthy = downCount === 0;
    const summary =
      items.length === 0
        ? "Connected to Meraki, but no devices were found in this organization."
        : `${items.length} device${items.length === 1 ? "" : "s"} checked${downCount ? `, ${downCount} offline/alerting` : ""}`;

    return { ok: true, healthy, summary, items, diagnostics };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Failed to query Cisco Meraki",
      diagnostics,
      healthy: false,
      summary: "",
      items: [],
    };
  }
}
