import { sqliteTable, text, integer, real, uniqueIndex } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

// Singleton settings row (id is always 1). Mirrors the old configuration.json's
// branding/theme/sla/network/email/behavior fields.
export const settings = sqliteTable("settings", {
  id: integer("id").primaryKey(),
  businessName: text("business_name").notNull().default("Status Page"),
  businessLogoPath: text("business_logo_path"),
  companyUrl: text("company_url"),
  supportEmail: text("support_email"),
  supportPhone: text("support_phone"),
  footerMessage: text("footer_message"),
  announcementBanner: text("announcement_banner"),
  announcementType: text("announcement_type").notNull().default("info"),

  themePrimaryColor: text("theme_primary_color").notNull().default("#4f46e5"),
  themeAccentColor: text("theme_accent_color").notNull().default("#06b6d4"),
  themeSuccessColor: text("theme_success_color").notNull().default("#059669"),
  themeWarningColor: text("theme_warning_color").notNull().default("#d97706"),
  themeErrorColor: text("theme_error_color").notNull().default("#dc2626"),

  slaEnabled: integer("sla_enabled", { mode: "boolean" }).notNull().default(false),
  slaUptimeTarget: real("sla_uptime_target").notNull().default(99.9),
  slaReportingPeriod: text("sla_reporting_period").notNull().default("monthly"),

  metaDescription: text("meta_description"),
  metaAuthor: text("meta_author"),
  configVersion: text("config_version").notNull().default("1.0.0"),

  refreshRateMs: integer("refresh_rate_ms").notNull().default(12000),
  alertSound: integer("alert_sound", { mode: "boolean" }).notNull().default(false),
  browserNotify: integer("browser_notify", { mode: "boolean" }).notNull().default(true),
  requireAuth: integer("require_auth", { mode: "boolean" }).notNull().default(true),
  servicesVisibleCount: integer("services_visible_count").notNull().default(10),

  gatewayHost: text("gateway_host"),
  publicDnsHost: text("public_dns_host").default("8.8.8.8"),
  internalDomain: text("internal_domain"),

  emailFrom: text("email_from"),
  emailReplyTo: text("email_reply_to"),
  smtpHost: text("smtp_host"),
  smtpPort: integer("smtp_port").default(587),
  smtpSecure: text("smtp_secure").default("tls"),
  smtpUsername: text("smtp_username"),
  smtpPassword: text("smtp_password"),
  smtpShowActionButtons: integer("smtp_show_action_buttons", { mode: "boolean" }).notNull().default(true),
  notifyDownAfterMinutes: integer("notify_down_after_minutes").notNull().default(3),

  storageIntegrationEnabled: integer("storage_integration_enabled", { mode: "boolean" }).notNull().default(false),
  powerstoreHost: text("powerstore_host"),
  powerstoreUsername: text("powerstore_username"),
  powerstorePassword: text("powerstore_password"),
  proxmoxHost: text("proxmox_host"),
  proxmoxTokenId: text("proxmox_token_id"),
  proxmoxTokenSecret: text("proxmox_token_secret"),
  proxmoxStorageId: text("proxmox_storage_id"),

  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const services = sqliteTable("services", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  host: text("host").notNull(),
  port: integer("port"), // null => ICMP ping
  type: text("type").notNull().default("tcp"), // substring-matched: contains "http"/"https"/"dns"
  description: text("description"),
  visible: integer("visible", { mode: "boolean" }).notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const rssFeeds = sqliteTable("rss_feeds", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  host: text("host").notNull(),
  tag: text("tag").notNull().default("item"), // 'item' (RSS) | 'entry' (Atom)
  description: text("description"),
  sortOrder: integer("sort_order").notNull().default(0),
});

export const ispMapEntries = sqliteTable("isp_map_entries", {
  ip: text("ip").primaryKey(),
  name: text("name").notNull(),
});

export const maintenanceWindows = sqliteTable("maintenance_windows", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  title: text("title"),
  startTime: text("start_time"),
  endTime: text("end_time"),
  description: text("description"),
});

export const statusCategories = sqliteTable("status_categories", {
  key: text("key").primaryKey(),
  label: text("label").notNull(),
  color: text("color").notNull(),
});

export const incidents = sqliteTable("incidents", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  title: text("title").notNull(),
  description: text("description"),
  severity: text("severity").notNull(), // degraded | outage | maintenance | resolved
  startTime: text("start_time").notNull(),
  endTime: text("end_time"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const subscriptions = sqliteTable(
  "subscriptions",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    email: text("email").notNull(),
    serviceId: integer("service_id")
      .notNull()
      .references(() => services.id, { onDelete: "cascade" }),
    subscribedAt: text("subscribed_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (t) => ({
    uniqueEmailService: uniqueIndex("uniq_email_service").on(t.email, t.serviceId),
  })
);

export const serviceStatus = sqliteTable("service_status", {
  serviceId: integer("service_id")
    .primaryKey()
    .references(() => services.id, { onDelete: "cascade" }),
  status: text("status"), // 'up' | 'down' | null (never checked)
  wentDownAt: integer("went_down_at"), // unix seconds
  lastDownAt: integer("last_down_at"),
  lastDownDurationS: integer("last_down_duration_s"),
  lastCheckedAt: integer("last_checked_at"),
  downNotified: integer("down_notified", { mode: "boolean" }).notNull().default(false),
});

export const outageLog = sqliteTable("outage_log", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  serviceId: integer("service_id").references(() => services.id, { onDelete: "set null" }),
  serviceName: text("service_name").notNull(), // denormalized so history survives service deletion
  wentDownAt: integer("went_down_at").notNull(),
  cameUpAt: integer("came_up_at").notNull(),
  durationS: integer("duration_s").notNull(),
});

export const emailTokens = sqliteTable("email_tokens", {
  token: text("token").primaryKey(),
  serviceId: integer("service_id").references(() => services.id, { onDelete: "cascade" }),
  serviceName: text("service_name").notNull(),
  action: text("action").notNull(), // 'wip' | 'resolved'
  expiresAt: integer("expires_at").notNull(), // unix seconds
});

// In-memory rate limiting is used at runtime (see lib/rateLimit.ts); this table exists
// only so a restart-persistent limiter could be added later without a schema change.
export const rateLimitHits = sqliteTable("rate_limit_hits", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  key: text("key").notNull(),
  ts: integer("ts").notNull(),
});
