/**
 * Manual, explicit import from a v2.x (PHP) deployment's flat-file data into this
 * app's SQLite database:
 *
 *   npx tsx migrate-legacy-data.ts /path/to/old/include
 *
 * Expects the legacy `include/` directory layout:
 *   configuration.json
 *   subscriptions.csv
 *   incidents.json
 *   cron/service_status.json
 *   cron/outage_log.json
 *
 * This is also run automatically (without needing this script) at container startup
 * if a legacy directory is found in a conventional location on a fresh database -- see
 * `findLegacyDir` in lib/legacyImport.ts and the check in migrate.ts. Use this script
 * directly when the legacy data lives somewhere non-standard.
 */
import { sqlite } from "./lib/db/client";
import { importLegacyData } from "./lib/legacyImport";

const legacyDir = process.argv[2];
if (!legacyDir) {
  console.error("Usage: npx tsx migrate-legacy-data.ts /path/to/old/include");
  process.exit(1);
}

importLegacyData(legacyDir);
sqlite.close();
