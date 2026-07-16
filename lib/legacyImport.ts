/**
 * Shared import logic for pulling a v2.x (PHP) deployment's flat-file data into this
 * app's SQLite database. Used both by the manual `migrate-legacy-data.ts` CLI script
 * and automatically at startup (see `findLegacyDir` + the check in `migrate.ts`).
 *
 * Never deletes or modifies the source files -- this is read-only against the legacy
 * directory, so it's always safe to leave the old files in place after importing.
 */
import fs from "node:fs";
import path from "node:path";
import { eq } from "drizzle-orm";
import { db } from "./db/client";
import { settings, services, rssFeeds, ispMapEntries, incidents, subscriptions, serviceStatus, outageLog } from "./db/schema";

interface LegacyHost {
  name?: string;
  host?: string;
  port?: number | null;
  type?: string;
  description?: string;
  visible?: boolean;
}
interface LegacyRss {
  name?: string;
  host?: string;
  tag?: string;
  description?: string;
}
interface LegacyIncident {
  title?: string;
  description?: string;
  severity?: string;
  start_time?: string;
  end_time?: string | null;
  time?: string;
}
interface LegacyServiceStatus {
  status?: string | null;
  last_down_at?: number | null;
  last_down_duration_s?: number | null;
  went_down_at?: number | null;
}
interface LegacyOutage {
  service?: string;
  went_down_at?: number;
  came_up_at?: number;
  duration_s?: number;
}

function readJson<T>(filePath: string, fallback: T): T {
  if (!fs.existsSync(filePath)) return fallback;
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8")) as T;
  } catch (err) {
    console.warn(`[legacy-import] failed to parse ${filePath}:`, err);
    return fallback;
  }
}

function parseCsvLine(line: string): string[] {
  // Minimal CSV field parser matching PHP's str_getcsv default quoting for this app's
  // own writer (fputcsv with default settings): comma-separated, double-quoted fields.
  const fields: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQuotes) {
      if (c === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (c === '"') {
        inQuotes = false;
      } else {
        cur += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      fields.push(cur);
      cur = "";
    } else {
      cur += c;
    }
  }
  fields.push(cur);
  return fields;
}

/** Candidate locations checked automatically at startup, in order. */
export function findLegacyDir(dataDir: string): string | null {
  const candidates = [
    path.join(dataDir, "legacy-include"), // operator mounts their old include/ into the volume
    path.join(process.cwd(), "include"), // old app's include/ sitting next to the new app (in-place upgrade)
  ];
  for (const dir of candidates) {
    if (fs.existsSync(path.join(dir, "configuration.json"))) return dir;
  }
  return null;
}

export function importLegacyData(legacyDir: string): void {
  const configPath = path.join(legacyDir, "configuration.json");
  const subsPath = path.join(legacyDir, "subscriptions.csv");
  const incidentsPath = path.join(legacyDir, "incidents.json");
  const statusPath = path.join(legacyDir, "cron", "service_status.json");
  const outagePath = path.join(legacyDir, "cron", "outage_log.json");

  if (!fs.existsSync(configPath)) {
    throw new Error(`Could not find ${configPath}`);
  }

  const cfg = readJson<Record<string, any>>(configPath, {});
  const branding = cfg.branding ?? {};
  const theme = cfg.theme ?? {};
  const sla = cfg.sla ?? {};
  const network = cfg.network ?? {};
  const email = cfg.email ?? {};
  const smtp = email.smtp ?? {};
  const meta = cfg.meta ?? {};

  console.log(`[legacy-import] importing from ${legacyDir}...`);

  console.log("[legacy-import] importing settings...");
  db.update(settings)
    .set({
      businessName: branding.business_name ?? cfg.business_name ?? "Status Page",
      companyUrl: branding.company_url ?? cfg.company_url ?? null,
      supportEmail: branding.support_email ?? null,
      supportPhone: branding.support_phone ?? null,
      footerMessage: branding.footer_message ?? cfg.footer_message ?? null,
      announcementBanner: branding.announcement_banner ?? null,
      announcementType: branding.announcement_type ?? "info",
      themePrimaryColor: theme.primary_color ?? "#4f46e5",
      themeAccentColor: theme.accent_color ?? "#06b6d4",
      themeSuccessColor: theme.success_color ?? "#059669",
      themeWarningColor: theme.warning_color ?? "#d97706",
      themeErrorColor: theme.error_color ?? "#dc2626",
      slaEnabled: !!sla.enabled,
      slaUptimeTarget: sla.uptime_target ?? 99.9,
      slaReportingPeriod: sla.reporting_period ?? "monthly",
      metaDescription: meta.description ?? null,
      metaAuthor: meta.author ?? null,
      refreshRateMs: cfg.refresh_rate ?? 12000,
      alertSound: !!cfg.alert_sound,
      browserNotify: cfg.browser_notify ?? true,
      requireAuth: cfg.require_auth ?? true,
      servicesVisibleCount: cfg.services_visible ?? 10,
      gatewayHost: network.gateway ?? null,
      publicDnsHost: network.public_dns ?? "8.8.8.8",
      internalDomain: network.domain ?? null,
      emailFrom: email.from ?? null,
      emailReplyTo: email.reply_to ?? null,
      smtpHost: smtp.host ?? null,
      smtpPort: smtp.port ?? 587,
      smtpSecure: smtp.secure ?? "tls",
      smtpUsername: smtp.username ?? null,
      smtpPassword: smtp.password ?? null,
      smtpShowActionButtons: email.show_action_buttons ?? true,
    })
    .where(eq(settings.id, 1))
    .run();

  console.log("[legacy-import] importing services...");
  const nameToId = new Map<string, number>();
  const legacyHosts: LegacyHost[] = cfg.internal_hosts ?? [];
  legacyHosts.forEach((h, index) => {
    const name = h.name ?? h.host ?? `service-${index}`;
    const row = db
      .insert(services)
      .values({
        name,
        host: h.host ?? "",
        port: h.port ?? null,
        type: h.type ?? "TCP",
        description: h.description ?? null,
        visible: h.visible ?? true,
        sortOrder: index,
      })
      .returning({ id: services.id })
      .get();
    nameToId.set(name, row.id);
  });
  console.log(`[legacy-import] imported ${nameToId.size} services`);

  console.log("[legacy-import] importing RSS feeds...");
  const legacyRss: LegacyRss[] = cfg.RSS ?? [];
  legacyRss.forEach((f, index) => {
    db.insert(rssFeeds)
      .values({
        name: f.name ?? "",
        host: f.host ?? "",
        tag: f.tag === "entry" ? "entry" : "item",
        description: f.description ?? null,
        sortOrder: index,
      })
      .run();
  });

  console.log("[legacy-import] importing ISP map...");
  const ispMap: Record<string, string> = network.isp_map ?? {};
  for (const [ip, name] of Object.entries(ispMap)) {
    db.insert(ispMapEntries).values({ ip, name }).run();
  }

  console.log("[legacy-import] importing incidents...");
  const legacyIncidents: LegacyIncident[] = readJson(incidentsPath, []);
  for (const inc of legacyIncidents) {
    db.insert(incidents)
      .values({
        title: inc.title ?? "",
        description: inc.description ?? null,
        severity: inc.severity ?? "outage",
        startTime: inc.start_time ?? inc.time ?? "",
        endTime: inc.end_time ?? null,
      })
      .run();
  }
  console.log(`[legacy-import] imported ${legacyIncidents.length} incidents`);

  console.log("[legacy-import] importing subscriptions...");
  let subCount = 0;
  if (fs.existsSync(subsPath)) {
    const lines = fs
      .readFileSync(subsPath, "utf8")
      .split(/\r?\n/)
      .filter((l) => l.trim().length > 0);
    for (const line of lines) {
      const [email, serviceName] = parseCsvLine(line);
      if (!email || !serviceName) continue;
      const serviceId = nameToId.get(serviceName);
      if (!serviceId) {
        console.warn(`[legacy-import] skipping subscription for unknown service "${serviceName}"`);
        continue;
      }
      db.insert(subscriptions).values({ email, serviceId }).onConflictDoNothing().run();
      subCount++;
    }
  }
  console.log(`[legacy-import] imported ${subCount} subscriptions`);

  console.log("[legacy-import] importing service status history...");
  const legacyStatus: Record<string, LegacyServiceStatus> = readJson(statusPath, {});
  for (const [name, s] of Object.entries(legacyStatus)) {
    const serviceId = nameToId.get(name);
    if (!serviceId) continue;
    db.insert(serviceStatus)
      .values({
        serviceId,
        status: s.status ?? null,
        wentDownAt: s.went_down_at ?? null,
        lastDownAt: s.last_down_at ?? null,
        lastDownDurationS: s.last_down_duration_s ?? null,
      })
      .onConflictDoUpdate({
        target: serviceStatus.serviceId,
        set: {
          status: s.status ?? null,
          wentDownAt: s.went_down_at ?? null,
          lastDownAt: s.last_down_at ?? null,
          lastDownDurationS: s.last_down_duration_s ?? null,
        },
      })
      .run();
  }

  console.log("[legacy-import] importing outage log...");
  const legacyOutages: LegacyOutage[] = readJson(outagePath, []);
  for (const o of legacyOutages) {
    if (!o.service || !o.went_down_at || !o.came_up_at) continue;
    db.insert(outageLog)
      .values({
        serviceId: nameToId.get(o.service) ?? null,
        serviceName: o.service,
        wentDownAt: o.went_down_at,
        cameUpAt: o.came_up_at,
        durationS: o.duration_s ?? o.came_up_at - o.went_down_at,
      })
      .run();
  }
  console.log(`[legacy-import] imported ${legacyOutages.length} outage log entries`);

  console.log(`[legacy-import] done. Source files left untouched at ${legacyDir}.`);
}
