import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { services, subscriptions } from "@/lib/db/schema";
import { verifyCsrf } from "@/lib/csrf";
import { rateLimit, clientIp } from "@/lib/rateLimit";

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/** Look up active subscriptions for an email address (the "manage subscriptions" flow). */
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
  const email = typeof body?.email === "string" ? body.email.trim() : "";
  if (!isValidEmail(email)) {
    return NextResponse.json({ status: "error", message: "Invalid email address." }, { status: 400 });
  }

  const rows = db
    .select({ serviceId: subscriptions.serviceId, serviceName: services.name })
    .from(subscriptions)
    .innerJoin(services, eq(subscriptions.serviceId, services.id))
    .where(eq(subscriptions.email, email))
    .all();

  return NextResponse.json({
    status: "success",
    message: rows.length === 0 ? "No subscriptions found for this email." : "Subscriptions found.",
    subscriptions: rows,
  });
}
