import { cookies } from "next/headers";
import crypto from "node:crypto";
import { isHttps } from "./request";

const CSRF_COOKIE = "csrf_token";

/** Issues the double-submit CSRF cookie if one doesn't already exist, and returns it. */
export async function ensureCsrfCookie(request: Request): Promise<string> {
  const store = await cookies();
  const existing = store.get(CSRF_COOKIE)?.value;
  if (existing) return existing;

  const token = crypto.randomBytes(32).toString("hex");
  store.set(CSRF_COOKIE, token, {
    httpOnly: false, // must be readable by client JS to echo back as a header
    secure: isHttps(request),
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
  return token;
}

/** Verifies the `X-CSRF-Token` header matches the csrf_token cookie (double-submit pattern). */
export async function verifyCsrf(request: Request): Promise<boolean> {
  const store = await cookies();
  const cookieToken = store.get(CSRF_COOKIE)?.value;
  const headerToken = request.headers.get("x-csrf-token");
  if (!cookieToken || !headerToken) return false;

  const a = Buffer.from(cookieToken);
  const b = Buffer.from(headerToken);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}
