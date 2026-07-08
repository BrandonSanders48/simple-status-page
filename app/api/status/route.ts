import { NextResponse } from "next/server";
import { getStatus } from "@/lib/statusCache";

export async function GET() {
  const data = await getStatus();
  return NextResponse.json(data);
}
