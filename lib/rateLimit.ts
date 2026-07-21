// In-memory limiter keyed by IP+action. The process is now persistent (unlike the old
// PHP app's per-session limiter, which reset the moment a client cleared cookies), so a
// plain Map is both simpler and stricter than what it replaces. A restart clears it,
// which is no worse than before.
const hits = new Map<string, number[]>();

export function rateLimit(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const recent = (hits.get(key) ?? []).filter((ts) => ts > now - windowMs);
  if (recent.length >= limit) {
    hits.set(key, recent);
    return false;
  }
  recent.push(now);
  hits.set(key, recent);
  return true;
}

/** True for loopback/private ranges (IPv4 10/8, 172.16/12, 192.168/16, 127/8; IPv6
 * ::1, fc00::/7 ULA, fe80::/10 link-local) -- i.e. "this connection came from the same
 * host or private network", the same heuristic other frameworks' `trust proxy`
 * settings use to decide when X-Forwarded-For is worth believing. */
function isPrivateOrLoopback(ip: string): boolean {
  const v4 = ip.replace(/^::ffff:/, "");
  if (/^127\./.test(v4)) return true;
  if (/^10\./.test(v4)) return true;
  if (/^192\.168\./.test(v4)) return true;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(v4)) return true;
  if (ip === "::1") return true;
  if (/^f[cd]/i.test(ip)) return true; // fc00::/7
  if (/^fe80:/i.test(ip)) return true; // fe80::/10
  return false;
}

/**
 * Identifies the caller for rate-limiting. `x-real-ip` is set by server.js directly
 * from the raw socket on every request (see server.js), overwriting anything a client
 * sent under that name, so it's never spoofable -- unlike `X-Forwarded-For`, which
 * any client can set to an arbitrary value to get a fresh rate-limit bucket on every
 * request. X-Forwarded-For is only trusted when the direct connection is itself from
 * a loopback/private address (a local reverse proxy relaying the real client's IP);
 * otherwise the real socket peer address is used even if X-Forwarded-For is present,
 * so a request straight from the public internet can't just lie about its IP.
 * `x-real-ip` won't be present at all outside server.js (e.g. `next dev`), in which
 * case this falls back to the old X-Forwarded-For-trusting behavior so local
 * development isn't left with no rate limiting at all.
 */
export function clientIp(request: Request): string {
  const realIp = request.headers.get("x-real-ip");
  const fwd = request.headers.get("x-forwarded-for");
  const forwardedClient = fwd?.split(",")[0]?.trim();

  if (realIp) {
    return forwardedClient && isPrivateOrLoopback(realIp) ? forwardedClient : realIp;
  }
  return forwardedClient || "unknown";
}
