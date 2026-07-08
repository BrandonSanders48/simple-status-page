import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { subscriptions } from "@/lib/db/schema";
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

  if (!isValidEmail(email)) {
    return NextResponse.json({ status: "error", message: "Invalid email address." }, { status: 400 });
  }

  if (action === "unsubscribe") {
    const deleted = db.delete(subscriptions).where(eq(subscriptions.email, email)).returning().all();
    return NextResponse.json({
      status: "success",
      message: deleted.length > 0 ? "Unsubscribed from all services." : "No subscriptions to remove.",
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

  return NextResponse.json({ status: "error", message: "Invalid action." }, { status: 400 });
}
