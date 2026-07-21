import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import {
  subscriptions,
  siteSubscriptions,
  integrationSubscriptions,
  phoneSubscriptions,
  sitePhoneSubscriptions,
  integrationPhoneSubscriptions,
} from "@/lib/db/schema";
import { verifyCsrf } from "@/lib/csrf";
import { rateLimit, clientIp } from "@/lib/rateLimit";

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function normalizePhone(raw: string): string | null {
  const stripped = raw.replace(/[\s().-]/g, "");
  return /^\+[1-9]\d{7,14}$/.test(stripped) ? stripped : null;
}

export async function POST(request: Request) {
  if (!(await verifyCsrf(request))) {
    return NextResponse.json({ status: "error", message: "Invalid CSRF token." }, { status: 403 });
  }
  if (!rateLimit(`unsubscribe:${clientIp(request)}`, 10, 10 * 60 * 1000)) {
    return NextResponse.json(
      { status: "error", message: "Too many unsubscribe attempts. Please wait and try again." },
      { status: 429 }
    );
  }

  const body = await request.json().catch(() => null);
  const rawEmail = typeof body?.email === "string" ? body.email.trim() : "";
  const rawPhone = typeof body?.phone === "string" ? body.phone.trim() : "";
  const action = typeof body?.action === "string" ? body.action : "";
  const serviceId = Number(body?.serviceId);
  const siteId = Number(body?.siteId);
  const targetId = Number(body?.targetId);

  if (!rawEmail && !rawPhone) {
    return NextResponse.json({ status: "error", message: "Enter an email address or a phone number." }, { status: 400 });
  }
  const email = rawEmail && isValidEmail(rawEmail) ? rawEmail : null;
  const phone = rawPhone ? normalizePhone(rawPhone) : null;
  if (rawEmail && !email) {
    return NextResponse.json({ status: "error", message: "Invalid email address." }, { status: 400 });
  }
  if (rawPhone && !phone) {
    return NextResponse.json({ status: "error", message: "Invalid phone number." }, { status: 400 });
  }

  if (action === "unsubscribe") {
    const deletedServices = email
      ? db.delete(subscriptions).where(eq(subscriptions.email, email)).returning().all()
      : db.delete(phoneSubscriptions).where(eq(phoneSubscriptions.phone, phone!)).returning().all();
    const deletedSites = email
      ? db.delete(siteSubscriptions).where(eq(siteSubscriptions.email, email)).returning().all()
      : db.delete(sitePhoneSubscriptions).where(eq(sitePhoneSubscriptions.phone, phone!)).returning().all();
    const deletedTargets = email
      ? db.delete(integrationSubscriptions).where(eq(integrationSubscriptions.email, email)).returning().all()
      : db.delete(integrationPhoneSubscriptions).where(eq(integrationPhoneSubscriptions.phone, phone!)).returning().all();
    return NextResponse.json({
      status: "success",
      message:
        deletedServices.length + deletedSites.length + deletedTargets.length > 0
          ? "Unsubscribed from all services, sites, and integrations."
          : "No subscriptions to remove.",
      action: "unsubscribe",
    });
  }

  if (action === "unsubscribe_single") {
    if (!Number.isInteger(serviceId)) {
      return NextResponse.json({ status: "error", message: "Invalid service." }, { status: 400 });
    }
    const deleted = email
      ? db.delete(subscriptions).where(and(eq(subscriptions.email, email), eq(subscriptions.serviceId, serviceId))).returning().all()
      : db.delete(phoneSubscriptions).where(and(eq(phoneSubscriptions.phone, phone!), eq(phoneSubscriptions.serviceId, serviceId))).returning().all();
    return NextResponse.json({
      status: "success",
      message: deleted.length > 0 ? "Unsubscribed from that service." : "No subscription found for that service.",
      action: "unsubscribe",
    });
  }

  if (action === "unsubscribe_single_site") {
    if (!Number.isInteger(siteId)) {
      return NextResponse.json({ status: "error", message: "Invalid site." }, { status: 400 });
    }
    const deleted = email
      ? db.delete(siteSubscriptions).where(and(eq(siteSubscriptions.email, email), eq(siteSubscriptions.siteId, siteId))).returning().all()
      : db.delete(sitePhoneSubscriptions).where(and(eq(sitePhoneSubscriptions.phone, phone!), eq(sitePhoneSubscriptions.siteId, siteId))).returning().all();
    return NextResponse.json({
      status: "success",
      message: deleted.length > 0 ? "Unsubscribed from that site." : "No subscription found for that site.",
      action: "unsubscribe",
    });
  }

  if (action === "unsubscribe_single_integration") {
    if (!Number.isInteger(targetId)) {
      return NextResponse.json({ status: "error", message: "Invalid integration." }, { status: 400 });
    }
    const deleted = email
      ? db
          .delete(integrationSubscriptions)
          .where(and(eq(integrationSubscriptions.email, email), eq(integrationSubscriptions.targetId, targetId)))
          .returning()
          .all()
      : db
          .delete(integrationPhoneSubscriptions)
          .where(and(eq(integrationPhoneSubscriptions.phone, phone!), eq(integrationPhoneSubscriptions.targetId, targetId)))
          .returning()
          .all();
    return NextResponse.json({
      status: "success",
      message: deleted.length > 0 ? "Unsubscribed from that integration." : "No subscription found for that integration.",
      action: "unsubscribe",
    });
  }

  return NextResponse.json({ status: "error", message: "Invalid action." }, { status: 400 });
}
