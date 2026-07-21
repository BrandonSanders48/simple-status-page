import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { verifyCsrf } from "@/lib/csrf";
import { db } from "@/lib/db/client";
import { pbsAcknowledgedTasks } from "@/lib/db/schema";
import { getIntegrationTarget } from "@/lib/integrationTargets";
import { invalidatePbsCache } from "@/lib/pbsCache";

/** Clears (acknowledges) a failed PBS backup task from the admin-only "Clear" button
 * on the public Backups panel - it stops counting toward that target's Last Run
 * Failed health/tab badge, but stays in the list as a record of what happened. */
export async function POST(request: Request) {
  if (!(await requireAuth())) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }
  if (!(await verifyCsrf(request))) {
    return NextResponse.json({ error: "Invalid CSRF token" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const taskId = typeof body?.taskId === "string" ? body.taskId : "";
  const targetId = Number(body?.targetId);
  if (!taskId || !Number.isInteger(targetId)) {
    return NextResponse.json({ error: "taskId and targetId are required" }, { status: 400 });
  }

  const target = getIntegrationTarget(targetId, "pbs");
  if (!target) {
    return NextResponse.json({ error: "PBS target not found" }, { status: 404 });
  }

  db.insert(pbsAcknowledgedTasks).values({ targetId, taskId }).onConflictDoNothing().run();

  invalidatePbsCache();
  return NextResponse.json({ ok: true });
}
