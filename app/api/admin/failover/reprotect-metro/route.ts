import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { verifyCsrf } from "@/lib/csrf";
import { rateLimit, clientIp } from "@/lib/rateLimit";
import { getIntegrationTarget } from "@/lib/integrationTargets";
import { reprotectMetroSession } from "@/lib/integrations/powerstore";
import { invalidateStorageCache } from "@/lib/storageCache";
import { recordFailoverAction } from "@/lib/failoverLog";

/**
 * Re-establishes replication on a Metro session that was previously promoted (the
 * first step of a failback) -- only ever targets a DR-flagged array, same as promote,
 * since in this tool's model that's always the side currently acting as primary.
 */
export async function POST(request: Request) {
  if (!(await requireAuth())) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }
  if (!(await verifyCsrf(request))) {
    return NextResponse.json({ error: "Invalid CSRF token" }, { status: 403 });
  }
  if (!rateLimit(`failover_reprotect:${clientIp(request)}`, 3, 5 * 60 * 1000)) {
    return NextResponse.json({ error: "Too many reprotect requests. Please wait and try again." }, { status: 429 });
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

  const result = await reprotectMetroSession(
    { host: target.config.host ?? "", username: target.config.username ?? "", password: target.config.password ?? "" },
    sessionId
  );
  recordFailoverAction({
    action: "reprotect_metro",
    targetName: target.name,
    detail: `Session ${sessionId}`,
    outcome: result.ok ? "success" : "error",
    errorMessage: result.error,
  });
  if (!result.ok) {
    return NextResponse.json({ error: result.error ?? "Failed to reprotect Metro session" }, { status: 502 });
  }

  invalidateStorageCache();
  return NextResponse.json({ ok: true });
}
