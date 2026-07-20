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
 *     each with an `id`/`name`. Used only when `organizationId` isn't configured (see
 *     fetchOrganizationId), mirroring this app's GoTo Connect accountKey auto-detect.
 *   - GET /organizations/{organizationId}/devices/availabilities -- CONFIRMED as the
 *     current (non-deprecated) endpoint for device status: the older
 *     /devices/statuses endpoint was marked deprecated in the docs as of October 2024
 *     in favor of this one. Each entry has `name`, `serial`, `productType`, and a
 *     `status` of "online"/"alerting"/"offline"/"dormant" -- refreshed by Meraki every
 *     5 minutes per the docs, so don't expect faster-than-that granularity. Only the
 *     first page (up to 1000 devices, the API's max perPage) is requested; an org with
 *     more devices than that will only show the first 1000, noted in `diagnostics`.
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

/** Resolves which organization to query: uses `config.organizationId` verbatim if
 * given, otherwise looks up the first organization this API key can see (diagnosing
 * if there's more than one, since there's no way to guess which one is intended). */
async function resolveOrganizationId(apiKey: string, configured: string, diagnostics: string[]): Promise<string | null> {
  if (configured) return configured;

  const result = await get(apiKey, "/organizations");
  if (result.error !== null) {
    diagnostics.push(result.error);
    return null;
  }
  const orgs = Array.isArray(result.data) ? (result.data as JsonRecord[]) : [];
  const first = orgs[0];
  if (!first) {
    diagnostics.push("/organizations returned no organizations for this API key");
    return null;
  }
  if (orgs.length > 1) {
    diagnostics.push(
      `This API key has access to ${orgs.length} organizations; using the first (${String(first.name ?? first.id)}). ` +
        "Set Organization ID in the integration's config to pin a different one."
    );
  }
  return typeof first.id === "string" ? first.id : null;
}

type Row = { label: string; value: string; ok: boolean | null };

const STATUS_LABEL: Record<string, string> = { online: "Online", offline: "Offline", alerting: "Alerting", dormant: "Dormant" };

async function fetchDeviceAvailabilities(apiKey: string, organizationId: string, diagnostics: string[]): Promise<Row[]> {
  const result = await get(apiKey, `/organizations/${encodeURIComponent(organizationId)}/devices/availabilities?perPage=1000`);
  if (result.error !== null) {
    diagnostics.push(result.error);
    return [];
  }
  const devices = Array.isArray(result.data) ? (result.data as JsonRecord[]) : [];
  if (devices.length === 1000) {
    diagnostics.push("This organization has 1000+ devices -- only the first 1000 (one API page) are shown here.");
  }

  return devices.map((d): Row => {
    const rawStatus = typeof d.status === "string" ? d.status : "";
    const status = rawStatus.toLowerCase();
    const label = (typeof d.name === "string" && d.name) || (typeof d.serial === "string" && d.serial) || "Device";
    const ok = status === "dormant" ? null : status === "online";
    return { label, value: STATUS_LABEL[status] || rawStatus || "Unknown", ok };
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
