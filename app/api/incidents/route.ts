import { NextResponse } from "next/server";
import { asc, desc } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { incidents, incidentUpdates } from "@/lib/db/schema";
import { requireAuth } from "@/lib/auth";
import { verifyCsrf } from "@/lib/csrf";
import { rateLimit, clientIp } from "@/lib/rateLimit";

const ALLOWED_SEVERITIES = ["degraded", "outage", "maintenance", "resolved"];

export async function GET() {
  const rows = db.select().from(incidents).orderBy(desc(incidents.startTime)).all();
  const updates = db.select().from(incidentUpdates).orderBy(asc(incidentUpdates.createdAt)).all();

  const updatesByIncident = new Map<number, typeof updates>();
  for (const u of updates) {
    const list = updatesByIncident.get(u.incidentId) ?? [];
    list.push(u);
    updatesByIncident.set(u.incidentId, list);
  }

  const withUpdates = rows.map((r) => ({ ...r, updates: updatesByIncident.get(r.id) ?? [] }));
  return NextResponse.json(withUpdates);
}

export async function POST(request: Request) {
  if (!(await requireAuth())) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }
  if (!(await verifyCsrf(request))) {
    return NextResponse.json({ error: "Invalid CSRF token" }, { status: 403 });
  }
  if (!rateLimit(`create_incident:${clientIp(request)}`, 10, 10 * 60 * 1000)) {
    return NextResponse.json(
      { error: "Too many incident submissions. Please wait and try again." },
      { status: 429 }
    );
  }

  const body = await request.json().catch(() => null);
  const title = typeof body?.title === "string" ? body.title.trim() : "";
  const description = typeof body?.description === "string" ? body.description.trim() : "";
  const startTime = typeof body?.start_time === "string" ? body.start_time : "";
  const endTime = typeof body?.end_time === "string" && body.end_time ? body.end_time : null;
  const severity = ALLOWED_SEVERITIES.includes(body?.severity) ? body.severity : "outage";

  if (!title || !description || !startTime) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }

  const row = db
    .insert(incidents)
    .values({ title, description, severity, startTime, endTime })
    .returning()
    .get();

  return NextResponse.json(row, { status: 201 });
}
