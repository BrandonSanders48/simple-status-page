import { NextResponse } from "next/server";
import { and, desc, eq, gte } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { outageLog } from "@/lib/db/schema";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const service = url.searchParams.get("service");
  const hours = Number(url.searchParams.get("hours"));

  const conditions = [];
  if (service) conditions.push(eq(outageLog.serviceName, service));
  if (Number.isFinite(hours) && hours > 0) {
    const cutoff = Math.floor(Date.now() / 1000) - hours * 3600;
    conditions.push(gte(outageLog.wentDownAt, cutoff));
  }

  const rows = db
    .select()
    .from(outageLog)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(outageLog.wentDownAt))
    .all();

  return NextResponse.json(rows);
}
