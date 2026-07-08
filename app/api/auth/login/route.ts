import { NextResponse } from "next/server";
import { createSession, verifyCredentials } from "@/lib/auth";
import { verifyCsrf } from "@/lib/csrf";
import { rateLimit, clientIp } from "@/lib/rateLimit";

export async function POST(request: Request) {
  if (!(await verifyCsrf(request))) {
    return NextResponse.json({ error: "Invalid CSRF token" }, { status: 403 });
  }

  if (!rateLimit(`login:${clientIp(request)}`, 5, 5 * 60 * 1000)) {
    return NextResponse.json(
      { error: "Too many login attempts. Please wait and try again." },
      { status: 429 }
    );
  }

  const body = await request.json().catch(() => null);
  const username = typeof body?.username === "string" ? body.username : "";
  const password = typeof body?.password === "string" ? body.password : "";

  if (!verifyCredentials(username, password)) {
    return NextResponse.json({ error: "Invalid credentials." }, { status: 401 });
  }

  await createSession();
  return NextResponse.json({ ok: true });
}
