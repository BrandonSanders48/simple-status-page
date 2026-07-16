import { NextResponse } from "next/server";
import { computeUptimeHistory } from "@/lib/uptimeHistory";

const DEFAULT_DAYS = 30;
const MAX_DAYS = 90;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const requested = Number(searchParams.get("days"));
  const days = Number.isInteger(requested) && requested > 0 ? Math.min(requested, MAX_DAYS) : DEFAULT_DAYS;

  return NextResponse.json(computeUptimeHistory(days));
}
