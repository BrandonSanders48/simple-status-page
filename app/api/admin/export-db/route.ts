import { NextResponse } from "next/server";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { requireAuth } from "@/lib/auth";
import { sqlite } from "@/lib/db/client";

/**
 * Downloads a consistent snapshot of the entire SQLite database (every table:
 * settings, services, sites, subscriptions, outage history, everything). Uses
 * better-sqlite3's built-in online backup API rather than just reading app.db's bytes
 * off disk directly -- the live connection runs in WAL mode, so the main file alone
 * can be missing recently-committed data that's still sitting in the -wal file; the
 * backup API produces a single self-contained, checkpoint-consistent file.
 */
export async function GET() {
  if (!(await requireAuth())) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  const tmpPath = path.join(os.tmpdir(), `status-page-export-${Date.now()}-${process.pid}.db`);
  try {
    await sqlite.backup(tmpPath);
    const buf = fs.readFileSync(tmpPath);
    const filename = `status-page-backup-${new Date().toISOString().slice(0, 10)}.db`;
    return new NextResponse(buf, {
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Content-Length": String(buf.length),
      },
    });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Export failed" }, { status: 500 });
  } finally {
    fs.rm(tmpPath, { force: true }, () => {});
  }
}
