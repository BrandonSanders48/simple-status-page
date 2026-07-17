import { NextResponse } from "next/server";
import { getPbsStatus } from "@/lib/pbsCache";

export async function GET() {
  const data = await getPbsStatus();
  return NextResponse.json(data);
}
