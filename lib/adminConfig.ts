import { z } from "zod";
import { eq, notInArray } from "drizzle-orm";
import { db } from "./db/client";
import { settings, services, rssFeeds, ispMapEntries, statusCategories, integrationTargets, sites } from "./db/schema";
import { parseIntegrationConfig, serializeIntegrationConfig } from "./integrationTargets";
import { maskIntegrationConfig, unmaskIntegrationConfig, MASKED_SECRET } from "./secretMasking";
import { encryptSecret } from "./secretCrypto";
import { getIntegrationCatalogMeta } from "./integrationCatalogMeta";

export const MAX_SERVICES = 20;
export const MAX_RSS_FEEDS = 10;
export const MAX_INTEGRATION_TARGETS = 40;
export const MAX_SITES = 20;

export const settingsInputSchema = z.object({
  businessName: z.string().min(1).max(200),
  companyUrl: z.string().max(500).nullable().optional(),
  supportEmail: z.string().max(200).nullable().optional(),
  supportPhone: z.string().max(50).nullable().optional(),
  announcementBanner: z.string().max(500).nullable().optional(),
  announcementType: z.enum(["info", "warning", "error"]),
  slaEnabled: z.boolean(),
  slaUptimeTarget: z.number().min(0).max(100),
  slaReportingPeriod: z.enum(["weekly", "monthly", "quarterly"]),
  refreshRateMs: z.number().int().min(3000),
  alertSound: z.boolean(),
  browserNotify: z.boolean(),
  requireAuth: z.boolean(),
  servicesVisibleCount: z.number().int().min(1).max(20),
  groupServicesBySite: z.boolean(),
  gatewayHost: z.string().max(200).nullable().optional(),
  publicDnsHost: z.string().max(200).nullable().optional(),
  internalDomain: z.string().max(200).nullable().optional(),
  emailFrom: z.string().max(200).nullable().optional(),
  emailReplyTo: z.string().max(200).nullable().optional(),
  smtpHost: z.string().max(200).nullable().optional(),
  smtpPort: z.number().int().min(1).max(65535).nullable().optional(),
  smtpSecure: z.enum(["tls", "ssl", "none"]).nullable().optional(),
  smtpUsername: z.string().max(200).nullable().optional(),
  smtpPassword: z.string().max(500).nullable().optional(),
  smtpShowActionButtons: z.boolean(),
  notifyDownAfterMinutes: z.number().int().min(0).max(1440),
  webhookEnabled: z.boolean(),
  webhookUrl: z.string().max(500).nullable().optional(),
  webhookFormat: z.enum(["slack", "discord", "generic"]),
});

export const serviceInputSchema = z.object({
  id: z.number().int().optional(),
  name: z.string().min(1).max(200),
  host: z.string().min(1).max(300),
  port: z.number().int().min(1).max(65535).nullable(),
  type: z.string().max(50),
  description: z.string().max(500).nullable().optional(),
  visible: z.boolean(),
  siteId: z.number().int().nullable().optional(),
});

export const siteInputSchema = z.object({
  id: z.number().int().optional(),
  name: z.string().min(1).max(200),
  tunnelHost: z.string().max(300).nullable().optional(),
  tunnelPort: z.number().int().min(1).max(65535).nullable().optional(),
});

export const rssFeedInputSchema = z.object({
  name: z.string().min(1).max(200),
  host: z.string().min(1).max(500),
  tag: z.enum(["item", "entry"]),
  description: z.string().max(500).nullable().optional(),
});

export const ispMapInputSchema = z.object({
  ip: z.string().min(1).max(100),
  name: z.string().min(1).max(200),
});

export const statusCategoryInputSchema = z.object({
  key: z.string().min(1).max(50),
  label: z.string().min(1).max(100),
  color: z.string().min(1).max(30),
});

// Every monitored external system - PowerStore, Proxmox, PBS, and marketplace
// integrations (UniFi, Sophos, GoTo Connect, etc) - shares this one input shape.
// `isDr` only means anything for powerstore/proxmox (it feeds the Failover tab), but
// living here generically means adding a new integration never needs a schema change.
export const integrationTargetInputSchema = z.object({
  id: z.number().int().optional(),
  integration: z.string().min(1).max(50),
  name: z.string().min(1).max(100),
  config: z.record(z.string().max(1000)),
  enabled: z.boolean(),
  isDr: z.boolean().optional().default(false),
});

export const configPayloadSchema = z.object({
  settings: settingsInputSchema,
  services: z.array(serviceInputSchema).max(MAX_SERVICES),
  rssFeeds: z.array(rssFeedInputSchema).max(MAX_RSS_FEEDS),
  ispMap: z.array(ispMapInputSchema),
  statusCategories: z.array(statusCategoryInputSchema).max(20),
  sites: z.array(siteInputSchema).max(MAX_SITES),
  // Optional - integration targets are edited on their own /admin/integrations page
  // (see saveIntegrationTargets below) and left untouched by a general config save
  // when omitted, so the two pages can't stomp on each other's edits.
  integrationTargets: z.array(integrationTargetInputSchema).max(MAX_INTEGRATION_TARGETS).optional(),
});

export const integrationTargetsPayloadSchema = z.object({
  integrationTargets: z.array(integrationTargetInputSchema).max(MAX_INTEGRATION_TARGETS),
});

export type ConfigPayload = z.infer<typeof configPayloadSchema>;

/** True whenever settings.smtpPassword has a value, encrypted or (for a legacy row
 * saved before encryption existed) plain - either way there's a real password stored,
 * without needing to decrypt just to answer "is one set". */
function maskSettingsForClient<T extends { smtpPassword: string | null }>(cfg: T): T {
  return { ...cfg, smtpPassword: cfg.smtpPassword ? MASKED_SECRET : cfg.smtpPassword };
}

export function getFullConfig() {
  const cfg = db.select().from(settings).get();
  const svc = db.select().from(services).all();
  const rss = db.select().from(rssFeeds).all();
  const isp = db.select().from(ispMapEntries).all();
  const categories = db.select().from(statusCategories).all();
  const siteRows = db.select().from(sites).all();
  const integrationRows = db.select().from(integrationTargets).all();
  return {
    settings: cfg ? maskSettingsForClient(cfg) : cfg,
    services: svc,
    rssFeeds: rss,
    ispMap: isp,
    statusCategories: categories,
    sites: siteRows,
    // config is stored as an encrypted JSON string (see lib/integrationTargets.ts) -
    // parsed/decrypted here, then any password-type field is masked before this ever
    // reaches the browser (see lib/secretMasking.ts). Every other reader of this
    // table (the integrations themselves, admin action routes) needs the real,
    // unmasked values and must call parseIntegrationConfig directly instead.
    integrationTargets: integrationRows.map((t) => {
      const config = parseIntegrationConfig(t.config);
      return { ...t, config: maskIntegrationConfig(t.integration, config) };
    }),
  };
}

export function getIntegrationTargets() {
  const integrationRows = db.select().from(integrationTargets).all();
  return integrationRows.map((t) => {
    const config = parseIntegrationConfig(t.config);
    return { ...t, config: maskIntegrationConfig(t.integration, config) };
  });
}

/**
 * Saves just the integration_targets table, diffed by id like saveFullConfig does for
 * services - used by the standalone /admin/integrations page, which never touches
 * settings/services/rssFeeds/ispMap/statusCategories, so it doesn't need (and shouldn't
 * risk overwriting via a stale full-config payload) any of those.
 */
export function saveIntegrationTargets(targets: z.infer<typeof integrationTargetInputSchema>[]) {
  // Existing (real, decrypted) configs, looked up before anything is deleted/replaced,
  // so a masked placeholder in the incoming payload (see lib/secretMasking.ts) can be
  // reconciled back to the real stored value instead of overwriting it with the
  // literal placeholder string.
  const existingById = new Map(db.select().from(integrationTargets).all().map((row) => [row.id, parseIntegrationConfig(row.config)]));

  db.transaction((tx) => {
    const incomingIds = targets.filter((t) => t.id !== undefined).map((t) => t.id!);
    if (incomingIds.length > 0) {
      tx.delete(integrationTargets).where(notInArray(integrationTargets.id, incomingIds)).run();
    } else {
      tx.delete(integrationTargets).run();
    }
    targets.forEach((t, index) => {
      const unmasked = unmaskIntegrationConfig(t.integration, t.config, t.id !== undefined ? existingById.get(t.id) : undefined);
      // Drops any key that isn't (or no longer is) one of this integration's catalog
      // fields - e.g. a field removed from lib/integrationCatalogMeta.ts after a target
      // was already saved - so a stale value can't keep influencing behavior (like
      // isGotoSmsAvailable) purely because it's still sitting in the stored JSON with
      // no admin UI left to see or clear it.
      const knownKeys = new Set(getIntegrationCatalogMeta(t.integration)?.fields.map((f) => f.key) ?? []);
      const config = Object.fromEntries(Object.entries(unmasked).filter(([key]) => knownKeys.has(key)));
      const row = { ...t, config: serializeIntegrationConfig(config), sortOrder: index };
      if (t.id !== undefined) {
        tx.update(integrationTargets).set(row).where(eq(integrationTargets.id, t.id)).run();
      } else {
        tx.insert(integrationTargets).values(row).run();
      }
    });
  });
  return getIntegrationTargets();
}

function bumpVersion(current: string): string {
  const parts = current.split(".");
  const major = parts[0] ?? "1";
  const minor = parseInt(parts[1] ?? "0", 10) || 0;
  return `${major}.${minor + 1}`;
}

/**
 * Saves the whole admin config in one transaction. Services and integration targets
 * are diffed by id (rather than delete-all-and-reinsert) so unrelated saves don't
 * cascade-delete service_status history/subscriptions, or (for integration targets)
 * break a target's id - referenced when acknowledging a PowerStore alert/PBS task, or
 * by the Failover tab's DR-flagged target lookups.
 */
export function saveFullConfig(payload: ConfigPayload) {
  const current = db.select().from(settings).get();
  const nextVersion = bumpVersion(current?.configVersion ?? "1.0");

  // A masked placeholder (see lib/secretMasking.ts) means the admin didn't touch the
  // password field, so the existing stored value (already encrypted, or legacy
  // plaintext - either way, untouched) is kept as-is rather than being overwritten
  // with the literal placeholder string. Anything else -- a real new password, or an
  // intentional blank to clear it -- is encrypted fresh.
  const nextSmtpPassword =
    payload.settings.smtpPassword === MASKED_SECRET
      ? (current?.smtpPassword ?? null)
      : payload.settings.smtpPassword
        ? encryptSecret(payload.settings.smtpPassword)
        : null;

  db.transaction((tx) => {
    tx.update(settings)
      .set({ ...payload.settings, smtpPassword: nextSmtpPassword, configVersion: nextVersion, updatedAt: new Date().toISOString() })
      .where(eq(settings.id, 1))
      .run();

    // Sites saved before services - services below reference them via site_id.
    // Diffed by id like services/integration targets so ids stay stable.
    const incomingSiteIds = payload.sites.filter((s) => s.id !== undefined).map((s) => s.id!);
    if (incomingSiteIds.length > 0) {
      tx.delete(sites).where(notInArray(sites.id, incomingSiteIds)).run();
    } else {
      tx.delete(sites).run();
    }
    payload.sites.forEach((site, index) => {
      if (site.id !== undefined) {
        tx.update(sites)
          .set({ ...site, sortOrder: index })
          .where(eq(sites.id, site.id))
          .run();
      } else {
        tx.insert(sites)
          .values({ ...site, sortOrder: index })
          .run();
      }
    });
    const survivingSiteIds = new Set(incomingSiteIds);

    const incomingIds = payload.services.filter((s) => s.id !== undefined).map((s) => s.id!);
    if (incomingIds.length > 0) {
      tx.delete(services).where(notInArray(services.id, incomingIds)).run();
    } else {
      tx.delete(services).run();
    }
    payload.services.forEach((svc, index) => {
      // Defensive: services.site_id's real FK is NO ACTION, not SET NULL (see the
      // schema.ts comment on why) - a service still pointing at a site that's no
      // longer in the incoming payload would otherwise throw a foreign key
      // constraint error here instead of just being ungrouped.
      const siteId = svc.siteId != null && survivingSiteIds.has(svc.siteId) ? svc.siteId : null;
      const row = { ...svc, siteId, sortOrder: index };
      if (svc.id !== undefined) {
        tx.update(services)
          .set(row)
          .where(eq(services.id, svc.id))
          .run();
      } else {
        tx.insert(services)
          .values(row)
          .run();
      }
    });

    tx.delete(rssFeeds).run();
    payload.rssFeeds.forEach((feed, index) => {
      tx.insert(rssFeeds)
        .values({ ...feed, sortOrder: index })
        .run();
    });

    tx.delete(ispMapEntries).run();
    if (payload.ispMap.length > 0) {
      tx.insert(ispMapEntries).values(payload.ispMap).run();
    }

    // Keys are a fixed seeded set (see migrate.ts) - only label/color are editable,
    // so this updates existing rows rather than delete-and-reinsert.
    payload.statusCategories.forEach((cat) => {
      tx.update(statusCategories)
        .set({ label: cat.label, color: cat.color })
        .where(eq(statusCategories.key, cat.key))
        .run();
    });

    // Omitted entirely - rather than an empty array - means "leave integration
    // targets alone" (see configPayloadSchema): they're edited on their own
    // /admin/integrations page now, via saveIntegrationTargets above.
    if (payload.integrationTargets) {
      const existingIntegrationConfigs = new Map(
        db.select().from(integrationTargets).all().map((row) => [row.id, parseIntegrationConfig(row.config)])
      );
      const incomingIntegrationIds = payload.integrationTargets.filter((t) => t.id !== undefined).map((t) => t.id!);
      if (incomingIntegrationIds.length > 0) {
        tx.delete(integrationTargets).where(notInArray(integrationTargets.id, incomingIntegrationIds)).run();
      } else {
        tx.delete(integrationTargets).run();
      }
      payload.integrationTargets.forEach((t, index) => {
        const config = unmaskIntegrationConfig(t.integration, t.config, t.id !== undefined ? existingIntegrationConfigs.get(t.id) : undefined);
        const row = { ...t, config: serializeIntegrationConfig(config), sortOrder: index };
        if (t.id !== undefined) {
          tx.update(integrationTargets)
            .set(row)
            .where(eq(integrationTargets.id, t.id))
            .run();
        } else {
          tx.insert(integrationTargets).values(row).run();
        }
      });
    }
  });

  return getFullConfig();
}
