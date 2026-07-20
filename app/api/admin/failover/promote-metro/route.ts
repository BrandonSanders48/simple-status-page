import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { verifyCsrf } from "@/lib/csrf";
import { rateLimit, clientIp } from "@/lib/rateLimit";
import { getIntegrationTarget } from "@/lib/integrationTargets";
import { promoteMetroSession } from "@/lib/integrations/powerstore";
import { invalidateStorageCache } from "@/lib/storageCache";
import { recordFailoverAction } from "@/lib/failoverLog";

/**
 * Promotes a Metro replication session on the DR-flagged PowerStore array -- the
 * storage half of a manual failover, alongside the Proxmox VM start/shutdown actions.
 * Only ever targets a DR-flagged array (never primary), and is rate limited given how
 * consequential a real Metro failover is on top of the usual auth/CSRF checks.
 */
export async function POST(request: Request) {
  if (!(await requireAuth())) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }
  if (!(await verifyCsrf(request))) {
    return NextResponse.json({ error: "Invalid CSRF token" }, { status: 403 });
  }
  if (!rateLimit(`failover_promote:${clientIp(request)}`, 3, 5 * 60 * 1000)) {
    return NextResponse.json({ error: "Too many promotion requests. Please wait and try again." }, { status: 429 });
  }

  const body = await request.json().catch(() => null);
  const targetId = Number(body?.targetId);
  const sessionId = typeof body?.sessionId === "string" ? body.sessionId : "";
  if (!Number.isInteger(targetId) || !sessionId) {
    return NextResponse.json({ error: "targetId and sessionId are required" }, { status: 400 });
  }

  const target = getIntegrationTarget(targetId, "powerstore");
  if (!target) {
    return NextResponse.json({ error: "PowerStore target not found" }, { status: 404 });
  }
  if (!target.isDr) {
    return NextResponse.json({ error: "That PowerStore target isn't marked as the DR site." }, { status: 400 });
  }

  const result = await promoteMetroSession(
    { host: target.config.host ?? "", username: target.config.username ?? "", password: target.config.password ?? "" },
    sessionId
  );
  recordFailoverAction({
    action: "promote_metro",
    targetName: target.name,
    detail: `Session ${sessionId}`,
    outcome: result.ok ? "success" : "error",
    errorMessage: result.error,
  });
  if (!result.ok) {
    return NextResponse.json({ error: result.error ?? "Failed to promote Metro session" }, { status: 502 });
  }

  invalidateStorageCache();
  return NextResponse.json({ ok: true });
}
