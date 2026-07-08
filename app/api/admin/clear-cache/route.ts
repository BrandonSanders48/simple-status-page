import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { verifyCsrf } from "@/lib/csrf";
import { invalidateStatusCache } from "@/lib/statusCache";
import { invalidateRssCache } from "@/lib/rssCache";

export async function POST(request: Request) {
  if (!(await requireAuth())) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }
  if (!(await verifyCsrf(request))) {
    return NextResponse.json({ error: "Invalid CSRF token" }, { status: 403 });
  }

  invalidateStatusCache();
  invalidateRssCache();

  return NextResponse.json({ ok: true });
}
