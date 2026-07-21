import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { subscriptions, siteSubscriptions, integrationSubscriptions } from "@/lib/db/schema";
import { verifyCsrf } from "@/lib/csrf";
import { rateLimit, clientIp } from "@/lib/rateLimit";

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
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
  const email = typeof body?.email === "string" ? body.email.trim() : "";
  const action = typeof body?.action === "string" ? body.action : "";
  const serviceId = Number(body?.serviceId);
  const siteId = Number(body?.siteId);
  const targetId = Number(body?.targetId);

  if (!isValidEmail(email)) {
    return NextResponse.json({ status: "error", message: "Invalid email address." }, { status: 400 });
  }

  if (action === "unsubscribe") {
    const deletedServices = db.delete(subscriptions).where(eq(subscriptions.email, email)).returning().all();
    const deletedSites = db.delete(siteSubscriptions).where(eq(siteSubscriptions.email, email)).returning().all();
    const deletedTargets = db.delete(integrationSubscriptions).where(eq(integrationSubscriptions.email, email)).returning().all();
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
    const deleted = db
      .delete(subscriptions)
      .where(and(eq(subscriptions.email, email), eq(subscriptions.serviceId, serviceId)))
      .returning()
      .all();
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
    const deleted = db
      .delete(siteSubscriptions)
      .where(and(eq(siteSubscriptions.email, email), eq(siteSubscriptions.siteId, siteId)))
      .returning()
      .all();
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
    const deleted = db
      .delete(integrationSubscriptions)
      .where(and(eq(integrationSubscriptions.email, email), eq(integrationSubscriptions.targetId, targetId)))
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
