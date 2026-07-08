import crypto from "node:crypto";
import { eq, lt } from "drizzle-orm";
import { db } from "./db/client";
import { emailTokens } from "./db/schema";

const TOKEN_TTL_SECONDS = 48 * 3600;

export interface ActionUrls {
  wip: string;
  resolved: string;
}

/** Creates a pair of one-time, 48h-expiring action tokens for a down-service email. */
export function generateActionTokens(serviceId: number, serviceName: string, pageUrl: string): ActionUrls {
  const now = Math.floor(Date.now() / 1000);
  // Opportunistically prune expired tokens so the table doesn't grow unbounded.
  db.delete(emailTokens).where(lt(emailTokens.expiresAt, now)).run();

  const expiresAt = now + TOKEN_TTL_SECONDS;
  const base = pageUrl.replace(/\/$/, "") + "/email-action?token=";
  const urls = {} as ActionUrls;

  for (const action of ["wip", "resolved"] as const) {
    const token = crypto.randomBytes(16).toString("hex");
    db.insert(emailTokens).values({ token, serviceId, serviceName, action, expiresAt }).run();
    urls[action] = base + token;
  }

  return urls;
}

export function getActionToken(token: string) {
  const now = Math.floor(Date.now() / 1000);
  const row = db.select().from(emailTokens).where(eq(emailTokens.token, token)).get();
  if (!row || row.expiresAt < now) return null;
  return row;
}

/** Deletes a token so it can't be replayed; call after successfully acting on it. */
export function consumeActionToken(token: string): void {
  db.delete(emailTokens).where(eq(emailTokens.token, token)).run();
}
