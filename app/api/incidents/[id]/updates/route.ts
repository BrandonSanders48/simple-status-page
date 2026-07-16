import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { incidents, incidentUpdates } from "@/lib/db/schema";
import { requireAuth } from "@/lib/auth";
import { verifyCsrf } from "@/lib/csrf";
import { rateLimit, clientIp } from "@/lib/rateLimit";

const ALLOWED_STATUSES = ["investigating", "identified", "monitoring", "resolved"];

/** Posts a new timeline entry to an existing incident. Posting a "resolved" update
 * also closes out the incident itself (sets endTime) if it wasn't already closed, so
 * the "Ongoing" badge and duration tracking stay consistent with the timeline. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requireAuth())) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }
  if (!(await verifyCsrf(request))) {
    return NextResponse.json({ error: "Invalid CSRF token" }, { status: 403 });
  }
  if (!rateLimit(`create_incident_update:${clientIp(request)}`, 20, 10 * 60 * 1000)) {
    return NextResponse.json({ error: "Too many submissions. Please wait and try again." }, { status: 429 });
  }

  const { id } = await params;
  const incidentId = Number(id);
  if (!Number.isInteger(incidentId)) {
    return NextResponse.json({ error: "Invalid incident id" }, { status: 400 });
  }

  const incident = db.select().from(incidents).where(eq(incidents.id, incidentId)).get();
  if (!incident) {
    return NextResponse.json({ error: "Incident not found" }, { status: 404 });
  }

  const body = await request.json().catch(() => null);
  const message = typeof body?.message === "string" ? body.message.trim() : "";
  const status = ALLOWED_STATUSES.includes(body?.status) ? body.status : "";
  if (!message || !status) {
    return NextResponse.json({ error: "Status and message are required" }, { status: 400 });
  }

  const row = db.insert(incidentUpdates).values({ incidentId, status, message }).returning().get();

  if (status === "resolved" && !incident.endTime) {
    db.update(incidents)
      .set({ endTime: new Date().toISOString().slice(0, 16) })
      .where(eq(incidents.id, incidentId))
      .run();
  }

  return NextResponse.json(row, { status: 201 });
}
