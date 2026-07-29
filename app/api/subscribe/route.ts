import { NextResponse } from "next/server";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db/client";
import {
  settings,
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
import { isSmtpConfigured, sendMail } from "@/lib/mailer";
import { renderWelcomeEmail } from "@/lib/emailTemplates";
import { resolvePageUrl } from "@/lib/pageUrl";
import { sendGotoSms, EMAIL_ACCENT_COLOR } from "@/lib/notifier";

/** True if this contact (whichever of email/phone is set) has never subscribed to
 * anything before this request - checked up front, before any of the inserts below,
 * so it reflects "brand new subscriber" rather than "subscribed to this specific
 * thing before". Used to gate the one-time welcome message below the isNewContact
 * check, not the regular per-transition status emails. */
function isNewContact(email: string | null, phone: string | null): boolean {
  if (email) {
    return (
      db.select({ id: subscriptions.id }).from(subscriptions).where(eq(subscriptions.email, email)).limit(1).all().length === 0 &&
      db.select({ id: siteSubscriptions.id }).from(siteSubscriptions).where(eq(siteSubscriptions.email, email)).limit(1).all().length === 0 &&
      db.select({ id: integrationSubscriptions.id }).from(integrationSubscriptions).where(eq(integrationSubscriptions.email, email)).limit(1).all()
        .length === 0
    );
  }
  if (phone) {
    return (
      db.select({ id: phoneSubscriptions.id }).from(phoneSubscriptions).where(eq(phoneSubscriptions.phone, phone)).limit(1).all().length === 0 &&
      db.select({ id: sitePhoneSubscriptions.id }).from(sitePhoneSubscriptions).where(eq(sitePhoneSubscriptions.phone, phone)).limit(1).all()
        .length === 0 &&
      db
        .select({ id: integrationPhoneSubscriptions.id })
        .from(integrationPhoneSubscriptions)
        .where(eq(integrationPhoneSubscriptions.phone, phone))
        .limit(1)
        .all().length === 0
    );
  }
  return false;
}

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

  // Computed before any inserts below, so it reflects whether this contact is
  // subscribing for the very first time (see isNewContact's doc comment).
  const newContact = isNewContact(email, phone);

  let addedCount = 0;
  const addedNames: string[] = [];

  if (serviceIds.length > 0) {
    const validRows = db.select({ id: services.id, name: services.name }).from(services).where(inArray(services.id, serviceIds)).all();
    const validIds = new Set(validRows.map((s) => s.id));
    const nameById = new Map(validRows.map((s) => [s.id, s.name]));
    if (email) {
      const alreadySubscribed = new Set(
        db
          .select({ serviceId: subscriptions.serviceId })
          .from(subscriptions)
          .where(and(eq(subscriptions.email, email), inArray(subscriptions.serviceId, serviceIds)))
          .all()
          .map((s) => s.serviceId)
      );
      const idsToAdd = serviceIds.filter((id) => validIds.has(id) && !alreadySubscribed.has(id));
      if (idsToAdd.length > 0) {
        db.insert(subscriptions).values(idsToAdd.map((serviceId) => ({ email, serviceId }))).run();
        addedCount += idsToAdd.length;
        idsToAdd.forEach((id) => addedNames.push(nameById.get(id)!));
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
      const idsToAdd = serviceIds.filter((id) => validIds.has(id) && !alreadySubscribed.has(id));
      if (idsToAdd.length > 0) {
        db.insert(phoneSubscriptions).values(idsToAdd.map((serviceId) => ({ phone, serviceId }))).run();
        addedCount += idsToAdd.length;
        idsToAdd.forEach((id) => addedNames.push(nameById.get(id)!));
      }
    }
  }

  if (siteIds.length > 0) {
    const validRows = db.select({ id: sites.id, name: sites.name }).from(sites).where(inArray(sites.id, siteIds)).all();
    const validIds = new Set(validRows.map((s) => s.id));
    const nameById = new Map(validRows.map((s) => [s.id, s.name]));
    if (email) {
      const alreadySubscribed = new Set(
        db
          .select({ siteId: siteSubscriptions.siteId })
          .from(siteSubscriptions)
          .where(and(eq(siteSubscriptions.email, email), inArray(siteSubscriptions.siteId, siteIds)))
          .all()
          .map((s) => s.siteId)
      );
      const idsToAdd = siteIds.filter((id) => validIds.has(id) && !alreadySubscribed.has(id));
      if (idsToAdd.length > 0) {
        db.insert(siteSubscriptions).values(idsToAdd.map((siteId) => ({ email, siteId }))).run();
        addedCount += idsToAdd.length;
        idsToAdd.forEach((id) => addedNames.push(nameById.get(id)!));
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
      const idsToAdd = siteIds.filter((id) => validIds.has(id) && !alreadySubscribed.has(id));
      if (idsToAdd.length > 0) {
        db.insert(sitePhoneSubscriptions).values(idsToAdd.map((siteId) => ({ phone, siteId }))).run();
        addedCount += idsToAdd.length;
        idsToAdd.forEach((id) => addedNames.push(nameById.get(id)!));
      }
    }
  }

  if (targetIds.length > 0) {
    const validRows = db
      .select({ id: integrationTargets.id, name: integrationTargets.name })
      .from(integrationTargets)
      .where(inArray(integrationTargets.id, targetIds))
      .all();
    const validIds = new Set(validRows.map((t) => t.id));
    const nameById = new Map(validRows.map((t) => [t.id, t.name]));
    if (email) {
      const alreadySubscribed = new Set(
        db
          .select({ targetId: integrationSubscriptions.targetId })
          .from(integrationSubscriptions)
          .where(and(eq(integrationSubscriptions.email, email), inArray(integrationSubscriptions.targetId, targetIds)))
          .all()
          .map((t) => t.targetId)
      );
      const idsToAdd = targetIds.filter((id) => validIds.has(id) && !alreadySubscribed.has(id));
      if (idsToAdd.length > 0) {
        db.insert(integrationSubscriptions).values(idsToAdd.map((targetId) => ({ email, targetId }))).run();
        addedCount += idsToAdd.length;
        idsToAdd.forEach((id) => addedNames.push(nameById.get(id)!));
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
      const idsToAdd = targetIds.filter((id) => validIds.has(id) && !alreadySubscribed.has(id));
      if (idsToAdd.length > 0) {
        db.insert(integrationPhoneSubscriptions).values(idsToAdd.map((targetId) => ({ phone, targetId }))).run();
        addedCount += idsToAdd.length;
        idsToAdd.forEach((id) => addedNames.push(nameById.get(id)!));
      }
    }
  }

  if (addedCount === 0) {
    return NextResponse.json({ status: "success", message: "You're already subscribed to everything selected." });
  }

  if (newContact) {
    await sendWelcomeMessage(email, phone, addedNames);
  }

  return NextResponse.json({ status: "success", message: `Subscribed to ${addedCount} more.` });
}

/** Sent once, right after a brand-new contact's first successful subscribe (see
 * isNewContact above) - confirms it went through and names what they're now signed
 * up for, since the subscribe modal gives no other confirmation once it closes.
 * Best-effort: a failure here must never fail the subscribe request itself, since the
 * subscription rows are already committed by the time this runs. */
async function sendWelcomeMessage(email: string | null, phone: string | null, itemNames: string[]): Promise<void> {
  const cfg = db.select().from(settings).get();
  if (!cfg) return;
  const url = resolvePageUrl(cfg);

  if (email && isSmtpConfigured(cfg)) {
    const html = renderWelcomeEmail({ businessName: cfg.businessName, accentColor: EMAIL_ACCENT_COLOR, linkUrl: url, itemNames });
    try {
      await sendMail(cfg, { to: email, subject: `You're subscribed to ${cfg.businessName} status alerts`, html });
    } catch (err) {
      console.error(`[subscribe] failed to send welcome email to ${email}:`, err);
    }
  } else if (phone) {
    // Kept short (no item list) since GoTo Connect SMS is billed per segment - the
    // welcome email above is where the full "here's what you're subscribed to" detail
    // lives.
    await sendGotoSms([phone], `${cfg.businessName}: You're now subscribed to status alerts.${url ? ` ${url}` : ""}`);
  }
}
