import { fetch as undiciFetch } from "undici";
import { insecureAgent } from "@/lib/insecureAgent";
import type { IntegrationStatus } from "./types";

interface UnifiConfig {
  host: string;
  username: string;
  password: string;
  site: string;
}

type JsonRecord = Record<string, unknown>;
type GetResult = { data: unknown; error: null } | { data: null; error: string };

function baseUrl(host: string): string {
  const trimmed = host.trim().replace(/\/$/, "");
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

interface Session {
  /** Includes the /proxy/network prefix for UniFi OS consoles (UDM/UDM-Pro/Cloud
   * Gateway), empty for a classic standalone controller. */
  apiBase: string;
  cookie: string;
  csrfToken?: string;
}

/**
 * UniFi has two API shapes depending on hardware: a UniFi OS console (UDM-Pro, Cloud
 * Gateway, Cloud Key Gen2+) reverse-proxies the network app under /proxy/network and
 * logs in at /api/auth/login with a CSRF token; a classic standalone controller logs
 * in at /api/login with no CSRF token and no path prefix. Tries the OS-console shape
 * first (more common on current hardware), falling back to the classic one.
 */
async function login(cfg: UnifiConfig): Promise<{ session?: Session; error?: string }> {
  const url = baseUrl(cfg.host);
  const variants: { loginPath: string; apiBase: string }[] = [
    { loginPath: "/api/auth/login", apiBase: `${url}/proxy/network` },
    { loginPath: "/api/login", apiBase: url },
  ];

  const errors: string[] = [];
  for (const variant of variants) {
    try {
      const res = await undiciFetch(`${url}${variant.loginPath}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: cfg.username, password: cfg.password }),
        dispatcher: insecureAgent,
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) {
        errors.push(`${variant.loginPath} returned HTTP ${res.status}`);
        continue;
      }
      const setCookie = res.headers.getSetCookie?.() ?? [];
      const cookie = setCookie.map((c) => c.split(";")[0]).join("; ");
      if (!cookie) {
        errors.push(`${variant.loginPath} returned no session cookie`);
        continue;
      }
      const csrfToken = res.headers.get("x-csrf-token") ?? undefined;
      return { session: { apiBase: variant.apiBase, cookie, csrfToken } };
    } catch (err) {
      errors.push(err instanceof Error ? `${variant.loginPath}: ${err.message}` : `${variant.loginPath}: request failed`);
    }
  }
  return { error: `Failed to authenticate with UniFi controller (${errors.join("; ")})` };
}

async function get(session: Session, path: string): Promise<GetResult> {
  try {
    const headers: Record<string, string> = { cookie: session.cookie };
    if (session.csrfToken) headers["x-csrf-token"] = session.csrfToken;
    const res = await undiciFetch(`${session.apiBase}${path}`, {
      headers,
      dispatcher: insecureAgent,
      signal: AbortSignal.timeout(8000),
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

function rowsOf(result: GetResult): JsonRecord[] {
  if (result.error) return [];
  const body = result.data as { data?: JsonRecord[] };
  return Array.isArray(body?.data) ? body.data : [];
}

/**
 * Queries a UniFi controller (local Network Application, either standalone or a
 * UniFi OS console) for subsystem health and device online/offline counts, using
 * cookie session auth: https://demo.ui.com/ (API reverse-engineered from community
 * documentation -- there's no official public API reference for the Network app, so
 * treat field names here as best-effort and check `diagnostics` if something's off).
 */
export async function fetchUnifiStatus(config: Record<string, string>): Promise<IntegrationStatus> {
  const cfg: UnifiConfig = {
    host: config.host?.trim() ?? "",
    username: config.username ?? "",
    password: config.password ?? "",
    site: config.site?.trim() || "default",
  };
  const diagnostics: string[] = [];

  if (!cfg.host || !cfg.username || !cfg.password) {
    return { ok: false, error: "Host, username, and password are required.", diagnostics, healthy: false, summary: "", items: [] };
  }

  const { session, error: loginError } = await login(cfg);
  if (!session) {
    return { ok: false, error: loginError ?? "Failed to log in to UniFi controller", diagnostics, healthy: false, summary: "", items: [] };
  }

  const [healthResult, deviceResult] = await Promise.all([
    get(session, `/api/s/${encodeURIComponent(cfg.site)}/stat/health`),
    get(session, `/api/s/${encodeURIComponent(cfg.site)}/stat/device`),
  ]);
  if (healthResult.error) diagnostics.push(healthResult.error);
  if (deviceResult.error) diagnostics.push(deviceResult.error);
  if (healthResult.error && deviceResult.error) {
    return { ok: false, error: healthResult.error, diagnostics, healthy: false, summary: "", items: [] };
  }

  const healthRows = rowsOf(healthResult);
  const deviceRows = rowsOf(deviceResult);

  const items: IntegrationStatus["items"] = [];
  let anyIssue = false;

  for (const subsystem of healthRows) {
    const name = typeof subsystem.subsystem === "string" ? subsystem.subsystem : "subsystem";
    // A missing `status` field, or UniFi's own literal "unknown" value, both mean "no
    // definitive reading for this subsystem" -- e.g. wan/www/vpn commonly report
    // "unknown" on a controller that doesn't use failover WAN or a VPN, not that
    // anything is actually down -- so neither counts against health. Only a status
    // that's actually present and isn't "ok"/"unknown" is a real problem.
    const rawStatus = typeof subsystem.status === "string" ? subsystem.status : null;
    if (rawStatus === null || rawStatus.toLowerCase() === "unknown") {
      items.push({ label: name, value: rawStatus ?? "N/A", ok: null, key: name });
      continue;
    }
    const ok = rawStatus === "ok";
    if (!ok) anyIssue = true;
    items.push({ label: name, value: rawStatus, ok, key: name });
  }

  const onlineDevices = deviceRows.filter((d) => d.state === 1).length;
  const totalDevices = deviceRows.length;
  const devicesOk = totalDevices === 0 || onlineDevices === totalDevices;
  if (!devicesOk) anyIssue = true;
  items.push({ label: "Devices online", value: `${onlineDevices}/${totalDevices}`, ok: devicesOk, key: "devices-online" });

  return {
    ok: true,
    diagnostics,
    healthy: !anyIssue,
    summary: `${onlineDevices}/${totalDevices} devices online, ${healthRows.length} subsystem(s) checked`,
    items,
  };
}
