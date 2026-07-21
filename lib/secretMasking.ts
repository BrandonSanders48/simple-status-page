import { getIntegrationCatalogMeta } from "./integrationCatalogMeta";

/** Stands in for a real secret value in any response sent to the browser. Distinct
 * enough from a real password that a user is very unlikely to type this by
 * coincidence, which is what lets the save path treat "field still equals this" as
 * "the admin didn't touch it" rather than "the admin wants the password literally set
 * to eight bullet points". */
export const MASKED_SECRET = "•".repeat(8);

/** Replaces every password-type field's value (per the integration's catalog entry)
 * with MASKED_SECRET before a config object is sent to the browser, so a real
 * credential is never round-tripped into a GET response, browser devtools, or the
 * network tab. Only ever call this right before returning to the client -- every
 * other consumer (the integrations themselves, admin action routes) needs the real
 * values and must read straight from parseIntegrationConfig instead. */
export function maskIntegrationConfig(integration: string, config: Record<string, string>): Record<string, string> {
  const passwordKeys = new Set(getIntegrationCatalogMeta(integration)?.fields.filter((f) => f.type === "password").map((f) => f.key) ?? []);
  if (passwordKeys.size === 0) return config;
  const masked: Record<string, string> = {};
  for (const [key, value] of Object.entries(config)) {
    masked[key] = passwordKeys.has(key) && value ? MASKED_SECRET : value;
  }
  return masked;
}

/** Inverse of maskIntegrationConfig, applied on save: any password-type field whose
 * incoming value is still exactly MASKED_SECRET means the admin left it untouched, so
 * the real stored value is restored from `existing` rather than overwriting the real
 * credential with the literal placeholder string. A field that's genuinely different
 * (a real new value, or intentionally cleared to "") passes through as typed. */
export function unmaskIntegrationConfig(
  integration: string,
  incoming: Record<string, string>,
  existing: Record<string, string> | undefined
): Record<string, string> {
  const passwordKeys = new Set(getIntegrationCatalogMeta(integration)?.fields.filter((f) => f.type === "password").map((f) => f.key) ?? []);
  if (passwordKeys.size === 0) return incoming;
  const result: Record<string, string> = { ...incoming };
  for (const key of passwordKeys) {
    if (result[key] === MASKED_SECRET) {
      result[key] = existing?.[key] ?? "";
    }
  }
  return result;
}
