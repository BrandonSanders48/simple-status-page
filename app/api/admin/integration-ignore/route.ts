import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { verifyCsrf } from "@/lib/csrf";
import { ignoreItem, unignoreItem } from "@/lib/integrationIgnore";
import { invalidateIntegrationsCache } from "@/lib/integrationsCache";

/** Toggles whether a specific row on a marketplace integration's card (identified by
 * its stable `key`, see IntegrationStatus.items) counts toward that target's healthy
 * rollup -- same "acknowledge, don't erase" pattern as /api/admin/pbs-task and
 * /api/admin/powerstore-alert, just generic across every marketplace integration
 * instead of one bespoke table per integration. */
export async function POST(request: Request) {
  if (!(await requireAuth())) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }
  if (!(await verifyCsrf(request))) {
    return NextResponse.json({ error: "Invalid CSRF token" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const targetId = typeof body?.targetId === "number" ? body.targetId : null;
  const itemKey = typeof body?.itemKey === "string" ? body.itemKey : null;
  const ignored = typeof body?.ignored === "boolean" ? body.ignored : null;
  if (targetId === null || !itemKey || ignored === null) {
    return NextResponse.json({ error: "targetId, itemKey, and ignored are required" }, { status: 400 });
  }

  try {
    if (ignored) ignoreItem(targetId, itemKey);
    else unignoreItem(targetId, itemKey);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed to update ignore state" }, { status: 400 });
  }

  invalidateIntegrationsCache();
  return NextResponse.json({ ok: true });
}
