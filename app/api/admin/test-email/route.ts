import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { verifyCsrf } from "@/lib/csrf";
import { db } from "@/lib/db/client";
import { settings } from "@/lib/db/schema";
import { isSmtpConfigured, sendMail } from "@/lib/mailer";
import { renderTestEmail } from "@/lib/emailTemplates";

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export async function POST(request: Request) {
  if (!(await requireAuth())) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }
  if (!(await verifyCsrf(request))) {
    return NextResponse.json({ error: "Invalid CSRF token" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const to = typeof body?.to === "string" ? body.to.trim() : "";
  if (!isValidEmail(to)) {
    return NextResponse.json({ error: "Invalid email address" }, { status: 400 });
  }

  const cfg = db.select().from(settings).get();
  if (!isSmtpConfigured(cfg)) {
    return NextResponse.json({ error: "SMTP is not configured. Save your SMTP settings first." }, { status: 400 });
  }

  const html = renderTestEmail({
    businessName: cfg.businessName,
    from: cfg.emailFrom || "status@example.com",
    to,
    linkUrl: cfg.companyUrl,
  });

  try {
    await sendMail(cfg, { to, subject: `Test Email - ${cfg.businessName}`, html });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed to send email" }, { status: 500 });
  }
}
