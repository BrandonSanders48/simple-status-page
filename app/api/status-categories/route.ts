import { NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { statusCategories } from "@/lib/db/schema";

export async function GET() {
  const rows = db.select().from(statusCategories).all();
  return NextResponse.json(rows);
}
