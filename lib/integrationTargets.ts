import { eq, and } from "drizzle-orm";
import { db } from "./db/client";
import { integrationTargets } from "./db/schema";
import { encryptSecret, decryptSecret } from "./secretCrypto";

/** Parses a stored integration_targets.config value, transparently decrypting it if
 * it's in the encrypted form written by serializeIntegrationConfig (see
 * lib/secretCrypto.ts). Rows saved before encryption was added are plain JSON and pass
 * through decryptSecret unchanged, so existing installs keep working with no
 * migration step; anything saved through this app from now on is written encrypted.
 * This is the one shared parser every reader of integration_targets.config should use
 * (lib/adminConfig.ts, lib/integrationsCache.ts, lib/storageCache.ts, lib/pbsCache.ts,
 * and getIntegrationTarget below) so decryption never has to be remembered per call
 * site. */
export function parseIntegrationConfig(raw: string): Record<string, string> {
  try {
    const parsed = JSON.parse(decryptSecret(raw));
    return typeof parsed === "object" && parsed !== null ? parsed : {};
  } catch {
    return {};
  }
}

/** Inverse of parseIntegrationConfig -- always writes the encrypted form, regardless
 * of whether the row being replaced was previously plaintext. */
export function serializeIntegrationConfig(config: Record<string, string>): string {
  return encryptSecret(JSON.stringify(config));
}

/** Looks up one integration_targets row by id, scoped to a specific integration key
 * (so an id that belongs to a different integration type is treated as not found,
 * not accidentally returned) - used by every admin action route that needs a single
 * target's credentials (PowerStore alert-acknowledge, PBS task-acknowledge, and every
 * Failover tab action). Returns `config` already parsed (and decrypted) from its
 * stored JSON string -- these are real credentials for making live calls, never mask
 * this. */
export function getIntegrationTarget(id: number, integration: string) {
  const row = db
    .select()
    .from(integrationTargets)
    .where(and(eq(integrationTargets.id, id), eq(integrationTargets.integration, integration)))
    .get();
  if (!row) return null;
  return { ...row, config: parseIntegrationConfig(row.config) };
}

/** True if at least one enabled GoTo Connect target has an SMS From number configured
 * (see lib/integrationCatalogMeta.ts) - i.e., phone/SMS notifications are actually
 * deliverable right now, not just theoretically supported. Used both to gate the
 * public Subscribe form's phone option (see lib/integrationsCache.ts's
 * IntegrationsPayload.smsAvailable) and to reject a phone subscription server-side
 * (app/api/subscribe/route.ts) if nothing could ever actually send it. */
export function isGotoSmsAvailable(): boolean {
  return db
    .select()
    .from(integrationTargets)
    .where(and(eq(integrationTargets.integration, "goto_connect"), eq(integrationTargets.enabled, true)))
    .all()
    .some((t) => !!parseIntegrationConfig(t.config).smsFromNumber);
}
