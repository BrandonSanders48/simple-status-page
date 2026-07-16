import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { verifyCsrf } from "@/lib/csrf";
import { db } from "@/lib/db/client";
import { settings } from "@/lib/db/schema";
import { sendWebhookNotification } from "@/lib/webhook";
import { resolvePageUrl } from "@/lib/pageUrl";

const ALLOWED_FORMATS = ["slack", "discord", "generic"];

export async function POST(request: Request) {
  if (!(await requireAuth())) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }
  if (!(await verifyCsrf(request))) {
    return NextResponse.json({ error: "Invalid CSRF token" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const url = typeof body?.url === "string" ? body.url.trim() : "";
  const format = ALLOWED_FORMATS.includes(body?.format) ? body.format : "generic";
  if (!url) {
    return NextResponse.json({ error: "Webhook URL is required" }, { status: 400 });
  }

  const cfg = db.select().from(settings).get();
  if (!cfg) {
    return NextResponse.json({ error: "Settings not found" }, { status: 500 });
  }

  try {
    await sendWebhookNotification(
      { ...cfg, webhookUrl: url, webhookFormat: format },
      { businessName: cfg.businessName, serviceName: "Test Service", status: "down", linkUrl: resolvePageUrl(cfg) }
    );
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed to send webhook" }, { status: 500 });
  }
}
