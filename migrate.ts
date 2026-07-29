import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { db, sqlite, DATA_DIR } from "./lib/db/client";
import { settings, statusCategories, rssFeeds, services, integrationTargets } from "./lib/db/schema";
import { findLegacyDir, importLegacyData } from "./lib/legacyImport";
import { isDecryptFailure } from "./lib/secretCrypto";

/** Warns loudly (rather than letting it pass silently) when AUTH_SECRET doesn't match
 * the key stored credentials were encrypted with - almost always because AUTH_SECRET
 * changed since they were saved (see lib/secretCrypto.ts's decryptSecret). Runs on
 * every startup since it's cheap and this is the only place that would otherwise go
 * unnoticed until an admin wonders why a saved password or integration looks blank. */
function checkAuthSecretIntegrity() {
  const problems: string[] = [];

  const cfg = db.select().from(settings).get();
  if (cfg?.smtpPassword && isDecryptFailure(cfg.smtpPassword)) {
    problems.push("SMTP password (Notifications settings)");
  }

  for (const t of db.select().from(integrationTargets).all()) {
    if (isDecryptFailure(t.config)) {
      problems.push(`integration target "${t.name}" (${t.integration})`);
    }
  }

  if (problems.length > 0) {
    console.warn(
      "[migrate] WARNING: AUTH_SECRET does not match the key these were encrypted with, so they " +
        `decrypted to empty and will appear blank until re-entered: ${problems.join(", ")}. ` +
        "This means AUTH_SECRET changed since they were saved - if you still have the original value, " +
        "restart the container with it restored; otherwise these need to be re-entered."
    );
  }
}

function run() {
  migrate(db, { migrationsFolder: "./lib/db/migrations" });

  const existing = db.select().from(settings).get();
  if (!existing) {
    db.insert(settings).values({ id: 1 }).run();
    console.log("[migrate] seeded default settings row");
  }

  const defaultCategories: Array<{ key: string; label: string; color: string }> = [
    { key: "operational", label: "Operational", color: "#059669" },
    { key: "degraded", label: "Degraded Performance", color: "#d97706" },
    { key: "outage", label: "Outage", color: "#dc2626" },
    { key: "maintenance", label: "Maintenance", color: "#6366f1" },
  ];
  for (const cat of defaultCategories) {
    db.insert(statusCategories).values(cat).onConflictDoNothing().run();
  }

  // A completely untouched database (no services configured yet, nothing saved or
  // imported before) is the only time it's safe to auto-import - this must never run
  // again on a restart once real config exists, or it would duplicate every row.
  const isFreshDatabase = db.select().from(services).all().length === 0;
  const legacyDir = isFreshDatabase ? findLegacyDir(DATA_DIR) : null;

  if (legacyDir) {
    console.log(`[migrate] found legacy data at ${legacyDir}, importing (source files are left untouched)...`);
    importLegacyData(legacyDir);
  } else if (isFreshDatabase) {
    const defaultFeeds: Array<{ name: string; host: string; tag: "item" | "entry"; description: string }> = [
      { name: "GoTo Connect", host: "https://status.goto.com/history.rss", tag: "item", description: "GoTo Connect status feed." },
      { name: "Microsoft Azure", host: "https://azure.status.microsoft/en-us/status/feed", tag: "item", description: "Microsoft Azure status feed." },
      { name: "Cisco Meraki", host: "https://status.meraki.net/history.rss", tag: "item", description: "Cisco Meraki status feed." },
      { name: "Paycor", host: "https://status.recruitingbypaycor.com/history.rss", tag: "item", description: "Paycor status feed." },
      { name: "Google", host: "https://www.google.com/appsstatus/dashboard/en/feed.atom", tag: "entry", description: "Google Apps status feed." },
      { name: "Google Cloud", host: "https://status.cloud.google.com/en/feed.atom", tag: "entry", description: "Google Cloud status feed." },
      { name: "Cloudflare", host: "https://www.cloudflarestatus.com/history.atom", tag: "item", description: "Cloudflare status feed." },
      { name: "Tailscale", host: "https://status.tailscale.com/history.rss", tag: "item", description: "Tailscale status feed." },
      { name: "UniFi", host: "https://status.ui.com/history.rss", tag: "item", description: "UniFi status feed." },
    ];
    defaultFeeds.forEach((feed, index) => {
      db.insert(rssFeeds).values({ ...feed, sortOrder: index }).run();
    });
    console.log(`[migrate] seeded ${defaultFeeds.length} default RSS feeds`);
  }

  checkAuthSecretIntegrity();

  console.log("[migrate] up to date");
  sqlite.close();
}

run();
