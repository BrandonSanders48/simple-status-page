import { NextResponse } from "next/server";
import { asc } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { maintenanceWindows } from "@/lib/db/schema";
import { requireAuth } from "@/lib/auth";
import { verifyCsrf } from "@/lib/csrf";
import { rateLimit, clientIp } from "@/lib/rateLimit";

export async function GET() {
  const rows = db.select().from(maintenanceWindows).orderBy(asc(maintenanceWindows.startTime)).all();
  return NextResponse.json(rows);
}

export async function POST(request: Request) {
  if (!(await requireAuth())) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }
  if (!(await verifyCsrf(request))) {
    return NextResponse.json({ error: "Invalid CSRF token" }, { status: 403 });
  }
  if (!rateLimit(`create_maintenance:${clientIp(request)}`, 10, 10 * 60 * 1000)) {
    return NextResponse.json({ error: "Too many submissions. Please wait and try again." }, { status: 429 });
  }

  const body = await request.json().catch(() => null);
  const title = typeof body?.title === "string" ? body.title.trim() : "";
  const description = typeof body?.description === "string" ? body.description.trim() : "";
  const startTime = typeof body?.start_time === "string" ? body.start_time : "";
  const endTime = typeof body?.end_time === "string" && body.end_time ? body.end_time : null;

  if (!title || !startTime) {
    return NextResponse.json({ error: "Title and start time are required" }, { status: 400 });
  }

  const row = db
    .insert(maintenanceWindows)
    .values({ title, description: description || null, startTime, endTime })
    .returning()
    .get();

  return NextResponse.json(row, { status: 201 });
}
