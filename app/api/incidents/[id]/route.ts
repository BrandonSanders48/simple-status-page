import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { incidents } from "@/lib/db/schema";
import { requireAuth } from "@/lib/auth";
import { verifyCsrf } from "@/lib/csrf";

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requireAuth())) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }
  if (!(await verifyCsrf(request))) {
    return NextResponse.json({ error: "Invalid CSRF token" }, { status: 403 });
  }

  const { id } = await params;
  const incidentId = Number(id);
  if (!Number.isInteger(incidentId)) {
    return NextResponse.json({ error: "Invalid incident id" }, { status: 400 });
  }

  const deleted = db.delete(incidents).where(eq(incidents.id, incidentId)).returning().get();
  if (!deleted) {
    return NextResponse.json({ error: "Incident not found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
