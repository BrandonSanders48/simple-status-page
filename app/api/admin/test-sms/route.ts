import { NextResponse } from "next/server";
import { eq, and } from "drizzle-orm";
import { requireAuth } from "@/lib/auth";
import { verifyCsrf } from "@/lib/csrf";
import { db } from "@/lib/db/client";
import { integrationTargets, settings } from "@/lib/db/schema";
import { parseIntegrationConfig } from "@/lib/integrationTargets";
import { sendGotoConnectSms } from "@/lib/integrations/gotoConnect";

/** Manual one-off test of the GoTo Connect SMS channel (see lib/notifier.ts's
 * sendGotoSms) - sends to whichever number the admin types in, using the first
 * enabled goto_connect target that has an SMS From number configured. */
export async function POST(request: Request) {
  if (!(await requireAuth())) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }
  if (!(await verifyCsrf(request))) {
    return NextResponse.json({ error: "Invalid CSRF token" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const to = typeof body?.to === "string" ? body.to.trim() : "";
  if (!to) {
    return NextResponse.json({ error: "Destination phone number is required" }, { status: 400 });
  }

  const gotoTargets = db
    .select()
    .from(integrationTargets)
    .where(and(eq(integrationTargets.integration, "goto_connect"), eq(integrationTargets.enabled, true)))
    .all();

  const target = gotoTargets.map((t) => ({ t, config: parseIntegrationConfig(t.config) })).find(({ config }) => !!config.smsFromNumber);
  if (!target) {
    return NextResponse.json({ error: "No enabled GoTo Connect target has an SMS From number configured." }, { status: 400 });
  }

  const cfg = db.select().from(settings).get();
  const result = await sendGotoConnectSms(target.config, to, `Test message from ${cfg?.businessName ?? "the status page"}.`);

  if (result.ok) {
    return NextResponse.json({ ok: true });
  }
  return NextResponse.json({ error: result.error || "Failed to send test SMS" }, { status: 500 });
}
