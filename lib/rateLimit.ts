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

export function clientIp(request: Request): string {
  const fwd = request.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0]?.trim() || "unknown";
  return "unknown";
}
