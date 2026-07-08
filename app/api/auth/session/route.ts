import { NextResponse } from "next/server";
import { hasValidSession, isAuthRequired } from "@/lib/auth";
import { ensureCsrfCookie } from "@/lib/csrf";

export async function GET(request: Request) {
  const csrfToken = await ensureCsrfCookie(request);
  const authRequired = isAuthRequired();
  const authenticated = authRequired ? await hasValidSession() : true;

  return NextResponse.json({ authenticated, authRequired, csrfToken });
}
