import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import crypto from "node:crypto";
import { db } from "./db/client";
import { settings } from "./db/schema";

const COOKIE_NAME = "session";
const SESSION_TTL_SECONDS = 12 * 60 * 60;

function getSecret(): Uint8Array {
  const secret = process.env.AUTH_SECRET;
  if (!secret) {
    throw new Error("AUTH_SECRET environment variable is not set");
  }
  return new TextEncoder().encode(secret);
}

/** Constant-time string comparison that also hides length differences. */
function timingSafeEqualStr(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  const len = Math.max(bufA.length, bufB.length, 1);
  const padA = Buffer.alloc(len);
  const padB = Buffer.alloc(len);
  bufA.copy(padA);
  bufB.copy(padB);
  return crypto.timingSafeEqual(padA, padB) && bufA.length === bufB.length;
}

export function verifyCredentials(username: string, password: string): boolean {
  const expectedUser = process.env.APP_USERNAME || "admin";
  const expectedPass = process.env.APP_PASSWORD || "changeme";
  return timingSafeEqualStr(username, expectedUser) && timingSafeEqualStr(password, expectedPass);
}

/** Mirrors the old app's precedence: env var overrides config, defaults to required. */
export function isAuthRequired(): boolean {
  const envVal = process.env.APP_AUTH_REQUIRED;
  if (envVal !== undefined && envVal !== "") {
    return envVal.toLowerCase() === "true" || envVal === "1";
  }
  const cfg = db.select({ requireAuth: settings.requireAuth }).from(settings).get();
  return cfg?.requireAuth ?? true;
}

export async function createSession(): Promise<void> {
  const jwt = await new SignJWT({ role: "admin" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_SECONDS}s`)
    .sign(getSecret());

  const store = await cookies();
  store.set(COOKIE_NAME, jwt, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });
}

export async function destroySession(): Promise<void> {
  const store = await cookies();
  store.delete(COOKIE_NAME);
}

export async function hasValidSession(): Promise<boolean> {
  const store = await cookies();
  const token = store.get(COOKIE_NAME)?.value;
  if (!token) return false;
  try {
    await jwtVerify(token, getSecret());
    return true;
  } catch {
    return false;
  }
}

/** True if the current request is allowed to perform admin actions. */
export async function requireAuth(): Promise<boolean> {
  if (!isAuthRequired()) return true;
  return hasValidSession();
}
