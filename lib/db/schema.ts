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
  announcementBanner: text("announcement_banner"),
  announcementType: text("announcement_type").notNull().default("info"),

  slaEnabled: integer("sla_enabled", { mode: "boolean" }).notNull().default(false),
  slaUptimeTarget: real("sla_uptime_target").notNull().default(99.9),
  slaReportingPeriod: text("sla_reporting_period").notNull().default("monthly"),

  configVersion: text("config_version").notNull().default("1.0.0"),

  refreshRateMs: integer("refresh_rate_ms").notNull().default(12000),
  alertSound: integer("alert_sound", { mode: "boolean" }).notNull().default(false),
  browserNotify: integer("browser_notify", { mode: "boolean" }).notNull().default(true),
  requireAuth: integer("require_auth", { mode: "boolean" }).notNull().default(true),
  servicesVisibleCount: integer("services_visible_count").notNull().default(10),
  // When true (default), the public page groups services under their assigned site's
  // header (see components/ServicesPanel.tsx). Off keeps every service in one flat
  // grid regardless of site assignment, for anyone who wants Sites purely as an admin
  // organization tool without changing what visitors see.
  groupServicesBySite: integer("group_services_by_site", { mode: "boolean" }).notNull().default(true),

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

  webhookEnabled: integer("webhook_enabled", { mode: "boolean" }).notNull().default(false),
  webhookUrl: text("webhook_url"),
  webhookFormat: text("webhook_format").notNull().default("generic"), // slack | discord | generic

  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

// A physical/network location (branch office, DR site, etc) that services can be
// grouped under - lets the public page tell apart "this one service is down" from
// "the whole site's tunnel dropped, so of course everything under it looks down".
// `tunnelHost`/`tunnelPort` are independent of any service's own check: a host/IP
// only reachable through that site's link (its far-side gateway, a switch, etc), so
// its own up/down is a direct signal of the tunnel itself, not conflated with
// whatever services happen to be assigned to the site. Both nullable: a site with
// no tunnel host configured just groups its services with no tunnel banner.
export const sites = sqliteTable("sites", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  tunnelHost: text("tunnel_host"),
  tunnelPort: integer("tunnel_port"), // null => ICMP ping, same convention as services.port
  sortOrder: integer("sort_order").notNull().default(0),
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
  // Optional grouping - null means "not assigned to a site", shown ungrouped same
  // as today. `onDelete: "set null"` here is aspirational only, NOT actually
  // enforced by SQLite: this column was added via `ALTER TABLE ADD COLUMN
  // ... REFERENCES`, which can't express an ON DELETE clause the way `CREATE TABLE`
  // can (see migration 0016) - the real constraint in the database is plain NO
  // ACTION. Rebuilding this table to get real SET NULL enforcement would require
  // DROP TABLE services, which would cascade-delete serviceStatus/outageLog rows
  // (both ON DELETE cascade on services.id), wiping current status and outage
  // history - not worth it for this. Keep this annotation matching what
  // migration 0016's snapshot already recorded (see meta/0016_snapshot.json).
  // saveSites() in lib/adminConfig.ts explicitly nulls out site_id on affected
  // services *before* deleting a site, in the same transaction, doing at the
  // application level what the DB itself won't enforce.
  siteId: integer("site_id").references(() => sites.id, { onDelete: "set null" }),
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

// Every monitored external system (PowerStore, Proxmox, PBS, and marketplace
// integrations like UniFi/Sophos/GoTo Connect, see lib/integrationRegistry.ts) shares
// this one table rather than getting a dedicated table each - `config` is a
// JSON-serialized Record<string,string> whose shape is defined by that integration's
// catalog entry, since each needs different credential fields. `isDr` is only
// meaningful for powerstore/proxmox (it marks a target as living at the DR site, so
// the Failover tab's recommendation and VM-start action can find it) but lives here
// generically rather than needing a separate table.
export const integrationTargets = sqliteTable("integration_targets", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  integration: text("integration").notNull(),
  name: text("name").notNull(),
  config: text("config").notNull(),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
  isDr: integer("is_dr", { mode: "boolean" }).notNull().default(false),
  sortOrder: integer("sort_order").notNull().default(0),
});

// Tracks each marketplace integration target's own healthy/unhealthy transitions (see
// lib/integrationsCache.ts's runIntegrationHealthChecks) so a change can be diffed and
// notified the same way service/site status changes are - unlike those, there's no
// end-user "subscribe to an integration" concept, so this only ever drives the
// Slack/Discord/generic webhook, not subscriber emails (see lib/notifier.ts).
export const integrationHealthStatus = sqliteTable("integration_health_status", {
  targetId: integer("target_id")
    .primaryKey()
    .references(() => integrationTargets.id, { onDelete: "cascade" }),
  healthy: integer("healthy", { mode: "boolean" }), // null = never checked
  wentUnhealthyAt: integer("went_unhealthy_at"),
  lastUnhealthyAt: integer("last_unhealthy_at"),
  lastUnhealthyDurationS: integer("last_unhealthy_duration_s"),
  lastCheckedAt: integer("last_checked_at"),
  downNotified: integer("down_notified", { mode: "boolean" }).notNull().default(false),
});

// Lets an admin "Clear" a failed backup task from the Backups tab - acknowledged
// tasks no longer count toward that target's Last Run Failed health/tab badge, but
// stay in the list (greyed out) as a record of what happened.
export const pbsAcknowledgedTasks = sqliteTable(
  "pbs_acknowledged_tasks",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    targetId: integer("target_id")
      .notNull()
      .references(() => integrationTargets.id, { onDelete: "cascade" }),
    taskId: text("task_id").notNull(),
    acknowledgedAt: text("acknowledged_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (t) => ({
    uniqueTargetTask: uniqueIndex("uniq_pbs_target_task").on(t.targetId, t.taskId),
  })
);

// Lets an admin "Ignore" a specific alerting/unhealthy row on a marketplace
// integration's card (UniFi/Sophos Central/Sophos XGS/GoTo Connect/Meraki/etc) -
// ignored items stay visible (dimmed, not hidden) but no longer count toward that
// target's healthy rollup or the "Attention" pill, same "acknowledge, don't erase"
// pattern as pbsAcknowledgedTasks above. `itemKey` is each integration's own stable
// per-row identifier (see IntegrationStatus.items in lib/integrations/types.ts) -
// not a DB foreign key of its own, since it points at a row inside a live API
// response, not a row in this database.
export const integrationIgnoredItems = sqliteTable(
  "integration_ignored_items",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    targetId: integer("target_id")
      .notNull()
      .references(() => integrationTargets.id, { onDelete: "cascade" }),
    itemKey: text("item_key").notNull(),
    ignoredAt: text("ignored_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (t) => ({
    uniqueTargetItem: uniqueIndex("uniq_integration_target_item").on(t.targetId, t.itemKey),
  })
);

// Audit trail for the Failover tab's destructive actions (starting/shutting down VMs,
// promoting/reprotecting a Metro session). targetName is denormalized so the log
// still reads clearly after a target is renamed or removed.
export const failoverActions = sqliteTable("failover_actions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  action: text("action").notNull(), // start_vms | shutdown_vms | promote_metro | reprotect_metro
  targetName: text("target_name").notNull(),
  detail: text("detail").notNull(),
  outcome: text("outcome").notNull(), // success | error
  errorMessage: text("error_message"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

// Audit trail for the "Test Network" tool - it's reachable without sign-in (see
// app/api/admin/test-network/route.ts) and makes this server connect to whatever
// host a caller names, so knowing who ran what, when, from what IP, matters. `ip` is
// whatever the server actually sees the request arrive from (X-Forwarded-For if
// present, else the raw connection) - on a LAN-only deployment with no reverse
// proxy/NAT in front of it, that's the same as the client's real LAN IP; behind one,
// it's that hop's IP instead. There's no reliable way for a webpage to learn a
// visitor's true local IP otherwise (the old WebRTC ICE-candidate trick is blocked
// by mDNS obfuscation in current Chrome/Firefox), so this isn't attempted.
export const networkTestLog = sqliteTable("network_test_log", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  host: text("host").notNull(),
  clientIp: text("client_ip").notNull(),
  okCount: integer("ok_count").notNull(),
  failCount: integer("fail_count").notNull(),
  inconclusiveCount: integer("inconclusive_count").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
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

// Timeline entries posted after an incident's initial creation (the incident's own
// title/description/severity/startTime doubles as the first entry in that timeline).
export const incidentUpdates = sqliteTable("incident_updates", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  incidentId: integer("incident_id")
    .notNull()
    .references(() => incidents.id, { onDelete: "cascade" }),
  status: text("status").notNull(), // investigating | identified | monitoring | resolved
  message: text("message").notNull(),
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

// A subscription to a site's own tunnel alerts (see lib/checks/site.ts), independent
// of subscribing to any service assigned to that site - deliberately its own table
// rather than a nullable serviceId/siteId column on `subscriptions`, both to avoid a
// risky rebuild of that existing (already-populated) table just to relax a NOT NULL
// column, and because "subscribed to a site" and "subscribed to a service" are kept as
// separate, independently-managed opt-ins (a site subscription does not imply its
// services', or vice versa).
export const siteSubscriptions = sqliteTable(
  "site_subscriptions",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    email: text("email").notNull(),
    siteId: integer("site_id")
      .notNull()
      .references(() => sites.id, { onDelete: "cascade" }),
    subscribedAt: text("subscribed_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (t) => ({
    uniqueEmailSite: uniqueIndex("uniq_email_site").on(t.email, t.siteId),
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

// Mirrors service_status, but for a site's own tunnel check (see lib/checks/site.ts) -
// lets a site's tunnel down/up be tracked and notified the same way a service's is,
// independently of any service assigned to it. Only ever has a row for sites with a
// tunnelHost configured (see runSiteChecks): a site with no tunnel check never gets a
// row here, same "invisible when off" convention as everywhere else this shows up.
// Unlike services.siteId (see above), this FK was created via CREATE TABLE, so
// `onDelete: "cascade"` is a real, enforced constraint, not just an annotation.
export const siteStatus = sqliteTable("site_status", {
  siteId: integer("site_id")
    .primaryKey()
    .references(() => sites.id, { onDelete: "cascade" }),
  status: text("status"), // 'up' | 'down' | null (never checked)
  wentDownAt: integer("went_down_at"),
  lastDownAt: integer("last_down_at"),
  lastDownDurationS: integer("last_down_duration_s"),
  lastCheckedAt: integer("last_checked_at"),
  downNotified: integer("down_notified", { mode: "boolean" }).notNull().default(false),
});

// Mirrors outage_log, but for site tunnel outages.
export const siteOutageLog = sqliteTable("site_outage_log", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  siteId: integer("site_id").references(() => sites.id, { onDelete: "set null" }),
  siteName: text("site_name").notNull(), // denormalized so history survives site deletion
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
