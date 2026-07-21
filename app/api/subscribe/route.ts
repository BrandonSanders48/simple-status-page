import { NextResponse } from "next/server";
import { and, eq, inArray } from "drizzle-orm";
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
import { isGotoSmsAvailable } from "@/lib/integrationTargets";

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/** Normalizes to E.164 (the format GoTo Connect's Messaging API expects for a
 * destination number - see lib/integrations/gotoConnect.ts's sendGotoConnectSms),
 * stripping common formatting characters first. Requires a leading "+" rather than
 * guessing a country code for a bare national number. */
function normalizePhone(raw: string): string | null {
  const stripped = raw.replace(/[\s().-]/g, "");
  return /^\+[1-9]\d{7,14}$/.test(stripped) ? stripped : null;
}

/**
 * Subscribes an email OR a phone number (exactly one, whichever the visitor entered)
 * to the given services/sites/integration targets - email is notified by the
 * existing subscriber-email flow, phone by SMS via GoTo Connect (see
 * lib/notifier.ts's sendGotoSms). Additive, not all-or-nothing: any ids the
 * email/phone is already subscribed to are just skipped (not treated as an error),
 * so re-opening this form to add one more thing never requires unsubscribing and
 * re-picking everything else first.
 */
export async function POST(request: Request) {
  if (!(await verifyCsrf(request))) {
    return NextResponse.json({ status: "error", message: "Invalid CSRF token." }, { status: 403 });
  }
  if (!rateLimit(`subscribe:${clientIp(request)}`, 10, 10 * 60 * 1000)) {
    return NextResponse.json(
      { status: "error", message: "Too many subscription attempts. Please wait and try again." },
      { status: 429 }
    );
  }

  const body = await request.json().catch(() => null);
  const rawEmail = typeof body?.email === "string" ? body.email.trim() : "";
  const rawPhone = typeof body?.phone === "string" ? body.phone.trim() : "";
  const serviceIds: number[] = Array.isArray(body?.serviceIds)
    ? body.serviceIds.map((id: unknown) => Number(id)).filter((id: number) => Number.isInteger(id))
    : [];
  const siteIds: number[] = Array.isArray(body?.siteIds)
    ? body.siteIds.map((id: unknown) => Number(id)).filter((id: number) => Number.isInteger(id))
    : [];
  const targetIds: number[] = Array.isArray(body?.targetIds)
    ? body.targetIds.map((id: unknown) => Number(id)).filter((id: number) => Number.isInteger(id))
    : [];

  if (!rawEmail && !rawPhone) {
    return NextResponse.json({ status: "error", message: "Enter an email address or a phone number." }, { status: 400 });
  }
  if (rawEmail && rawPhone) {
    return NextResponse.json({ status: "error", message: "Enter either an email address or a phone number, not both." }, { status: 400 });
  }

  const email = rawEmail ? (isValidEmail(rawEmail) ? rawEmail : null) : null;
  const phone = rawPhone ? normalizePhone(rawPhone) : null;
  if (rawEmail && !email) {
    return NextResponse.json({ status: "error", message: "Invalid email address." }, { status: 400 });
  }
  if (rawPhone && !phone) {
    return NextResponse.json({ status: "error", message: "Invalid phone number - include a country code, e.g. +15145550100." }, { status: 400 });
  }
  if (phone && !isGotoSmsAvailable()) {
    return NextResponse.json(
      { status: "error", message: "Phone/SMS subscriptions aren't available right now. Please subscribe with an email address instead." },
      { status: 400 }
    );
  }

  if (serviceIds.length === 0 && siteIds.length === 0 && targetIds.length === 0) {
    return NextResponse.json({ status: "error", message: "No service, site, or integration selected." }, { status: 400 });
  }

  let addedCount = 0;

  if (serviceIds.length > 0) {
    const validIds = new Set(db.select({ id: services.id }).from(services).where(inArray(services.id, serviceIds)).all().map((s) => s.id));
    if (email) {
      const alreadySubscribed = new Set(
        db
          .select({ serviceId: subscriptions.serviceId })
          .from(subscriptions)
          .where(and(eq(subscriptions.email, email), inArray(subscriptions.serviceId, serviceIds)))
          .all()
          .map((s) => s.serviceId)
      );
      const toInsert = serviceIds.filter((id) => validIds.has(id) && !alreadySubscribed.has(id)).map((serviceId) => ({ email, serviceId }));
      if (toInsert.length > 0) {
        db.insert(subscriptions).values(toInsert).run();
        addedCount += toInsert.length;
      }
    } else if (phone) {
      const alreadySubscribed = new Set(
        db
          .select({ serviceId: phoneSubscriptions.serviceId })
          .from(phoneSubscriptions)
          .where(and(eq(phoneSubscriptions.phone, phone), inArray(phoneSubscriptions.serviceId, serviceIds)))
          .all()
          .map((s) => s.serviceId)
      );
      const toInsert = serviceIds.filter((id) => validIds.has(id) && !alreadySubscribed.has(id)).map((serviceId) => ({ phone, serviceId }));
      if (toInsert.length > 0) {
        db.insert(phoneSubscriptions).values(toInsert).run();
        addedCount += toInsert.length;
      }
    }
  }

  if (siteIds.length > 0) {
    const validIds = new Set(db.select({ id: sites.id }).from(sites).where(inArray(sites.id, siteIds)).all().map((s) => s.id));
    if (email) {
      const alreadySubscribed = new Set(
        db
          .select({ siteId: siteSubscriptions.siteId })
          .from(siteSubscriptions)
          .where(and(eq(siteSubscriptions.email, email), inArray(siteSubscriptions.siteId, siteIds)))
          .all()
          .map((s) => s.siteId)
      );
      const toInsert = siteIds.filter((id) => validIds.has(id) && !alreadySubscribed.has(id)).map((siteId) => ({ email, siteId }));
      if (toInsert.length > 0) {
        db.insert(siteSubscriptions).values(toInsert).run();
        addedCount += toInsert.length;
      }
    } else if (phone) {
      const alreadySubscribed = new Set(
        db
          .select({ siteId: sitePhoneSubscriptions.siteId })
          .from(sitePhoneSubscriptions)
          .where(and(eq(sitePhoneSubscriptions.phone, phone), inArray(sitePhoneSubscriptions.siteId, siteIds)))
          .all()
          .map((s) => s.siteId)
      );
      const toInsert = siteIds.filter((id) => validIds.has(id) && !alreadySubscribed.has(id)).map((siteId) => ({ phone, siteId }));
      if (toInsert.length > 0) {
        db.insert(sitePhoneSubscriptions).values(toInsert).run();
        addedCount += toInsert.length;
      }
    }
  }

  if (targetIds.length > 0) {
    const validIds = new Set(
      db.select({ id: integrationTargets.id }).from(integrationTargets).where(inArray(integrationTargets.id, targetIds)).all().map((t) => t.id)
    );
    if (email) {
      const alreadySubscribed = new Set(
        db
          .select({ targetId: integrationSubscriptions.targetId })
          .from(integrationSubscriptions)
          .where(and(eq(integrationSubscriptions.email, email), inArray(integrationSubscriptions.targetId, targetIds)))
          .all()
          .map((t) => t.targetId)
      );
      const toInsert = targetIds.filter((id) => validIds.has(id) && !alreadySubscribed.has(id)).map((targetId) => ({ email, targetId }));
      if (toInsert.length > 0) {
        db.insert(integrationSubscriptions).values(toInsert).run();
        addedCount += toInsert.length;
      }
    } else if (phone) {
      const alreadySubscribed = new Set(
        db
          .select({ targetId: integrationPhoneSubscriptions.targetId })
          .from(integrationPhoneSubscriptions)
          .where(and(eq(integrationPhoneSubscriptions.phone, phone), inArray(integrationPhoneSubscriptions.targetId, targetIds)))
          .all()
          .map((t) => t.targetId)
      );
      const toInsert = targetIds.filter((id) => validIds.has(id) && !alreadySubscribed.has(id)).map((targetId) => ({ phone, targetId }));
      if (toInsert.length > 0) {
        db.insert(integrationPhoneSubscriptions).values(toInsert).run();
        addedCount += toInsert.length;
      }
    }
  }

  if (addedCount === 0) {
    return NextResponse.json({ status: "success", message: "You're already subscribed to everything selected." });
  }
  return NextResponse.json({ status: "success", message: `Subscribed to ${addedCount} more.` });
}
