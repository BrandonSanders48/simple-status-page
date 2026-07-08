import { NextResponse } from "next/server";
import { getRss } from "@/lib/rssCache";

export async function GET() {
  const data = await getRss();
  return NextResponse.json(data);
}
