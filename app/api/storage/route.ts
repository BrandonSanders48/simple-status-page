import { NextResponse } from "next/server";
import { getStorageStatus } from "@/lib/storageCache";

export async function GET() {
  const data = await getStorageStatus();
  return NextResponse.json(data);
}
