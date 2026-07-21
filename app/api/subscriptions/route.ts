import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import {
  services,
  sites,
  integrationTargets,
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

/** Look up active service, site, and integration subscriptions for an email address
 * OR a phone number (the "manage subscriptions" flow). */
export async function POST(request: Request) {
  if (!(await verifyCsrf(request))) {
    return NextResponse.json({ status: "error", message: "Invalid CSRF token." }, { status: 403 });
  }
  if (!rateLimit(`manage_subscribe:${clientIp(request)}`, 10, 10 * 60 * 1000)) {
    return NextResponse.json(
      { status: "error", message: "Too many requests. Please wait and try again." },
      { status: 429 }
    );
  }

  const body = await request.json().catch(() => null);
  const rawEmail = typeof body?.email === "string" ? body.email.trim() : "";
  const rawPhone = typeof body?.phone === "string" ? body.phone.trim() : "";
  if (!rawEmail && !rawPhone) {
    return NextResponse.json({ status: "error", message: "Enter an email address or a phone number." }, { status: 400 });
  }

  const email = rawEmail && isValidEmail(rawEmail) ? rawEmail : null;
  const phone = rawPhone ? normalizePhone(rawPhone) : null;
  if (rawEmail && !email) {
    return NextResponse.json({ status: "error", message: "Invalid email address." }, { status: 400 });
  }
  if (rawPhone && !phone) {
    return NextResponse.json({ status: "error", message: "Invalid phone number - include a country code, e.g. +15145550100." }, { status: 400 });
  }

  const serviceRows = email
    ? db
        .select({ serviceId: subscriptions.serviceId, serviceName: services.name })
        .from(subscriptions)
        .innerJoin(services, eq(subscriptions.serviceId, services.id))
        .where(eq(subscriptions.email, email))
        .all()
    : db
        .select({ serviceId: phoneSubscriptions.serviceId, serviceName: services.name })
        .from(phoneSubscriptions)
        .innerJoin(services, eq(phoneSubscriptions.serviceId, services.id))
        .where(eq(phoneSubscriptions.phone, phone!))
        .all();

  const siteRows = email
    ? db
        .select({ siteId: siteSubscriptions.siteId, siteName: sites.name })
        .from(siteSubscriptions)
        .innerJoin(sites, eq(siteSubscriptions.siteId, sites.id))
        .where(eq(siteSubscriptions.email, email))
        .all()
    : db
        .select({ siteId: sitePhoneSubscriptions.siteId, siteName: sites.name })
        .from(sitePhoneSubscriptions)
        .innerJoin(sites, eq(sitePhoneSubscriptions.siteId, sites.id))
        .where(eq(sitePhoneSubscriptions.phone, phone!))
        .all();

  const targetRows = email
    ? db
        .select({ targetId: integrationSubscriptions.targetId, targetName: integrationTargets.name })
        .from(integrationSubscriptions)
        .innerJoin(integrationTargets, eq(integrationSubscriptions.targetId, integrationTargets.id))
        .where(eq(integrationSubscriptions.email, email))
        .all()
    : db
        .select({ targetId: integrationPhoneSubscriptions.targetId, targetName: integrationTargets.name })
        .from(integrationPhoneSubscriptions)
        .innerJoin(integrationTargets, eq(integrationPhoneSubscriptions.targetId, integrationTargets.id))
        .where(eq(integrationPhoneSubscriptions.phone, phone!))
        .all();

  return NextResponse.json({
    status: "success",
    message:
      serviceRows.length === 0 && siteRows.length === 0 && targetRows.length === 0
        ? "No subscriptions found."
        : "Subscriptions found.",
    subscriptions: serviceRows,
    siteSubscriptions: siteRows,
    integrationSubscriptions: targetRows,
  });
}
