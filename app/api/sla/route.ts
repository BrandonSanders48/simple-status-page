import { NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { settings } from "@/lib/db/schema";
import { computeUptime } from "@/lib/sla";

export async function GET() {
  const cfg = db.select().from(settings).get();
  if (!cfg?.slaEnabled) {
    return NextResponse.json({ enabled: false });
  }

  const result = computeUptime(cfg.slaReportingPeriod);
  return NextResponse.json({
    enabled: true,
    target: cfg.slaUptimeTarget,
    reportingPeriod: cfg.slaReportingPeriod,
    ...result,
  });
}
