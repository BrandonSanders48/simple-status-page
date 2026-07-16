import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { verifyCsrf } from "@/lib/csrf";
import { db } from "@/lib/db/client";
import { settings } from "@/lib/db/schema";
import { acknowledgePowerstoreAlert } from "@/lib/integrations/powerstore";
import { invalidateStorageCache } from "@/lib/storageCache";

/** Clears (acknowledges) a PowerStore alert from the admin-only "Clear" button on the
 * public Storage panel, then invalidates the cache so it drops off the list on the
 * next poll instead of waiting up to 60s for the cache to expire naturally. */
export async function POST(request: Request) {
  if (!(await requireAuth())) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }
  if (!(await verifyCsrf(request))) {
    return NextResponse.json({ error: "Invalid CSRF token" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const alertId = typeof body?.alertId === "string" ? body.alertId : "";
  if (!alertId) {
    return NextResponse.json({ error: "alertId is required" }, { status: 400 });
  }

  const cfg = db.select().from(settings).get();
  if (!cfg?.powerstoreHost || !cfg.powerstoreUsername || !cfg.powerstorePassword) {
    return NextResponse.json({ error: "PowerStore is not configured" }, { status: 400 });
  }

  const result = await acknowledgePowerstoreAlert(
    { host: cfg.powerstoreHost, username: cfg.powerstoreUsername, password: cfg.powerstorePassword },
    alertId
  );
  if (!result.ok) {
    return NextResponse.json({ error: result.error ?? "Failed to acknowledge alert" }, { status: 502 });
  }

  invalidateStorageCache();
  return NextResponse.json({ ok: true });
}
