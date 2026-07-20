import { eq, and } from "drizzle-orm";
import { db } from "./db/client";
import { integrationTargets } from "./db/schema";

function parseConfig(raw: string): Record<string, string> {
  try {
    const parsed = JSON.parse(raw);
    return typeof parsed === "object" && parsed !== null ? parsed : {};
  } catch {
    return {};
  }
}

/** Looks up one integration_targets row by id, scoped to a specific integration key
 * (so an id that belongs to a different integration type is treated as not found,
 * not accidentally returned) -- used by every admin action route that needs a single
 * target's credentials (PowerStore alert-acknowledge, PBS task-acknowledge, and every
 * Failover tab action). Returns `config` already parsed from its stored JSON string. */
export function getIntegrationTarget(id: number, integration: string) {
  const row = db
    .select()
    .from(integrationTargets)
    .where(and(eq(integrationTargets.id, id), eq(integrationTargets.integration, integration)))
    .get();
  if (!row) return null;
  return { ...row, config: parseConfig(row.config) };
}
