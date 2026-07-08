import { NextResponse } from "next/server";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { services, subscriptions } from "@/lib/db/schema";
import { verifyCsrf } from "@/lib/csrf";
import { rateLimit, clientIp } from "@/lib/rateLimit";

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

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

  if (!isValidEmail(email)) {
    return NextResponse.json({ status: "error", message: "Invalid email address." }, { status: 400 });
  }
  if (serviceIds.length === 0) {
    return NextResponse.json({ status: "error", message: "No service selected." }, { status: 400 });
  }

  const validServices = db.select({ id: services.id }).from(services).where(inArray(services.id, serviceIds)).all();
  const validIds = new Set(validServices.map((s) => s.id));

  const existing = db
    .select({ serviceId: subscriptions.serviceId })
    .from(subscriptions)
    .where(and(eq(subscriptions.email, email), inArray(subscriptions.serviceId, serviceIds)))
    .all();
  if (existing.length > 0) {
    return NextResponse.json(
      { status: "error", message: "You are already subscribed to one or more selected services." },
      { status: 409 }
    );
  }

  const toInsert = serviceIds.filter((id) => validIds.has(id)).map((serviceId) => ({ email, serviceId }));
  if (toInsert.length === 0) {
    return NextResponse.json({ status: "error", message: "No valid services selected." }, { status: 400 });
  }
  db.insert(subscriptions).values(toInsert).run();

  return NextResponse.json({ status: "success", message: "Subscribed successfully!" });
}
