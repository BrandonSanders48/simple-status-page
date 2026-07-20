import { and, eq } from "drizzle-orm";
import { db } from "./db/client";
import { integrationIgnoredItems } from "./db/schema";

/** Every item key an admin has ignored for a given marketplace target -- see
 * IntegrationStatus.items in lib/integrations/types.ts for what `key` identifies. */
export function getIgnoredKeys(targetId: number): Set<string> {
  const rows = db
    .select({ itemKey: integrationIgnoredItems.itemKey })
    .from(integrationIgnoredItems)
    .where(eq(integrationIgnoredItems.targetId, targetId))
    .all();
  return new Set(rows.map((r) => r.itemKey));
}

export function ignoreItem(targetId: number, itemKey: string): void {
  db.insert(integrationIgnoredItems)
    .values({ targetId, itemKey })
    .onConflictDoNothing()
    .run();
}

export function unignoreItem(targetId: number, itemKey: string): void {
  db.delete(integrationIgnoredItems)
    .where(and(eq(integrationIgnoredItems.targetId, targetId), eq(integrationIgnoredItems.itemKey, itemKey)))
    .run();
}
