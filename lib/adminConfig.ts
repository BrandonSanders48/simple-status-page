import { z } from "zod";
import { eq, notInArray } from "drizzle-orm";
import { db } from "./db/client";
import { settings, services, rssFeeds, ispMapEntries, statusCategories, integrationTargets } from "./db/schema";

export const MAX_SERVICES = 20;
export const MAX_RSS_FEEDS = 10;
export const MAX_INTEGRATION_TARGETS = 40;

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

// Every monitored external system -- PowerStore, Proxmox, PBS, and marketplace
// integrations (UniFi, Sophos, GoTo Connect, etc) -- shares this one input shape.
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
  integrationTargets: z.array(integrationTargetInputSchema).max(MAX_INTEGRATION_TARGETS),
});

export type ConfigPayload = z.infer<typeof configPayloadSchema>;

function parseIntegrationConfig(raw: string): Record<string, string> {
  try {
    const parsed = JSON.parse(raw);
    return typeof parsed === "object" && parsed !== null ? parsed : {};
  } catch {
    return {};
  }
}

export function getFullConfig() {
  const cfg = db.select().from(settings).get();
  const svc = db.select().from(services).all();
  const rss = db.select().from(rssFeeds).all();
  const isp = db.select().from(ispMapEntries).all();
  const categories = db.select().from(statusCategories).all();
  const integrationRows = db.select().from(integrationTargets).all();
  return {
    settings: cfg,
    services: svc,
    rssFeeds: rss,
    ispMap: isp,
    statusCategories: categories,
    // config is stored as a JSON string (see lib/db/schema.ts) -- parsed here so the
    // admin UI can bind to individual fields directly.
    integrationTargets: integrationRows.map((t) => ({ ...t, config: parseIntegrationConfig(t.config) })),
  };
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
 * break a target's id -- referenced when acknowledging a PowerStore alert/PBS task, or
 * by the Failover tab's DR-flagged target lookups.
 */
export function saveFullConfig(payload: ConfigPayload) {
  const current = db.select().from(settings).get();
  const nextVersion = bumpVersion(current?.configVersion ?? "1.0");

  db.transaction((tx) => {
    tx.update(settings)
      .set({ ...payload.settings, configVersion: nextVersion, updatedAt: new Date().toISOString() })
      .where(eq(settings.id, 1))
      .run();

    const incomingIds = payload.services.filter((s) => s.id !== undefined).map((s) => s.id!);
    if (incomingIds.length > 0) {
      tx.delete(services).where(notInArray(services.id, incomingIds)).run();
    } else {
      tx.delete(services).run();
    }
    payload.services.forEach((svc, index) => {
      if (svc.id !== undefined) {
        tx.update(services)
          .set({ ...svc, sortOrder: index })
          .where(eq(services.id, svc.id))
          .run();
      } else {
        tx.insert(services)
          .values({ ...svc, sortOrder: index })
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

    // Keys are a fixed seeded set (see migrate.ts) -- only label/color are editable,
    // so this updates existing rows rather than delete-and-reinsert.
    payload.statusCategories.forEach((cat) => {
      tx.update(statusCategories)
        .set({ label: cat.label, color: cat.color })
        .where(eq(statusCategories.key, cat.key))
        .run();
    });

    const incomingIntegrationIds = payload.integrationTargets.filter((t) => t.id !== undefined).map((t) => t.id!);
    if (incomingIntegrationIds.length > 0) {
      tx.delete(integrationTargets).where(notInArray(integrationTargets.id, incomingIntegrationIds)).run();
    } else {
      tx.delete(integrationTargets).run();
    }
    payload.integrationTargets.forEach((t, index) => {
      const row = { ...t, config: JSON.stringify(t.config), sortOrder: index };
      if (t.id !== undefined) {
        tx.update(integrationTargets)
          .set(row)
          .where(eq(integrationTargets.id, t.id))
          .run();
      } else {
        tx.insert(integrationTargets).values(row).run();
      }
    });
  });

  return getFullConfig();
}
