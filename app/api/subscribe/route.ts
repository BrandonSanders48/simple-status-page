import { NextResponse } from "next/server";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { services, sites, subscriptions, siteSubscriptions } from "@/lib/db/schema";
import { verifyCsrf } from "@/lib/csrf";
import { rateLimit, clientIp } from "@/lib/rateLimit";

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/**
 * Subscribes an email to the given services/sites. Additive, not all-or-nothing: any
 * ids the email is already subscribed to are just skipped (not treated as an error),
 * so re-opening this form to add one more service/site never requires unsubscribing
 * and re-picking everything else first.
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
  const email = typeof body?.email === "string" ? body.email.trim() : "";
  const serviceIds: number[] = Array.isArray(body?.serviceIds)
    ? body.serviceIds.map((id: unknown) => Number(id)).filter((id: number) => Number.isInteger(id))
    : [];
  const siteIds: number[] = Array.isArray(body?.siteIds)
    ? body.siteIds.map((id: unknown) => Number(id)).filter((id: number) => Number.isInteger(id))
    : [];

  if (!isValidEmail(email)) {
    return NextResponse.json({ status: "error", message: "Invalid email address." }, { status: 400 });
  }
  if (serviceIds.length === 0 && siteIds.length === 0) {
    return NextResponse.json({ status: "error", message: "No service or site selected." }, { status: 400 });
  }

  let addedCount = 0;

  if (serviceIds.length > 0) {
    const validIds = new Set(db.select({ id: services.id }).from(services).where(inArray(services.id, serviceIds)).all().map((s) => s.id));
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
  }

  if (siteIds.length > 0) {
    const validIds = new Set(db.select({ id: sites.id }).from(sites).where(inArray(sites.id, siteIds)).all().map((s) => s.id));
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
  }

  if (addedCount === 0) {
    return NextResponse.json({ status: "success", message: "You're already subscribed to everything selected." });
  }
  return NextResponse.json({ status: "success", message: `Subscribed to ${addedCount} more.` });
}
