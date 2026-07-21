import fs from "fs";
import path from "path";
import { DATA_DIR } from "./db/client";

const LOG_PATH = path.join(DATA_DIR, "notifications.log");

// Truncated back down to its last half once it passes this size, so a long-running
// instance doesn't grow this file forever.
const MAX_BYTES = 2 * 1024 * 1024;

/** Appends one line per outbound SMS attempt (see lib/notifier.ts's sendGotoSms) to a
 * plain-text file in the data directory, so an admin can check whether a text
 * actually sent (and why not, if it didn't) without needing server console access -
 * surfaced in Admin > Notifications via readNotificationLog below. Best-effort: a
 * logging failure (e.g. disk full) should never break the actual notification. */
export function logNotificationAttempt(line: string): void {
  try {
    if (fs.existsSync(LOG_PATH) && fs.statSync(LOG_PATH).size > MAX_BYTES) {
      const contents = fs.readFileSync(LOG_PATH, "utf8");
      fs.writeFileSync(LOG_PATH, contents.slice(Math.floor(contents.length / 2)));
    }
    fs.appendFileSync(LOG_PATH, `${new Date().toISOString()} ${line}\n`);
  } catch {
    // Ignore - see doc comment above.
  }
}

/** Last `maxLines` entries, most recent first - backs the read-only log viewer in
 * Admin > Notifications. Returns an empty array if the file doesn't exist yet
 * (nothing has been sent), rather than treating that as an error. */
export function readNotificationLog(maxLines = 200): string[] {
  try {
    const contents = fs.readFileSync(LOG_PATH, "utf8");
    const lines = contents.split("\n").filter((l) => l.trim().length > 0);
    return lines.slice(-maxLines).reverse();
  } catch {
    return [];
  }
}
