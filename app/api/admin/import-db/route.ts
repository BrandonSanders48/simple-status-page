import { NextResponse } from "next/server";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { requireAuth } from "@/lib/auth";
import { verifyCsrf } from "@/lib/csrf";
import { sqlite, DB_PATH, DATA_DIR } from "@/lib/db/client";

// A sanity check that the upload is actually one of this app's own databases, not an
// arbitrary SQLite file -- checked against a handful of core tables rather than every
// table, since new tables get added over time and this only needs to catch "wrong file
// entirely", not enforce an exact schema version match.
const REQUIRED_TABLES = ["settings", "services", "sites", "integration_targets"];
const MAX_SIZE = 500 * 1024 * 1024;

/**
 * Replaces the entire live database with an uploaded backup file (see export-db's
 * route for how that file is produced). This is deliberately destructive and
 * disruptive:
 *   - The current database is backed up to disk first (pre-import-backup-<ts>.db) as
 *     a safety net, in case the import needs to be undone.
 *   - The live connection is checkpointed and closed so its file locks are released
 *     before the underlying file is replaced -- every other route that touches the
 *     database will start failing immediately after this runs, for every request,
 *     until the app process is restarted and reconnects to the new file. There is no
 *     in-process way to "reopen" the shared connection other tables already imported;
 *     a restart is genuinely required, and the response says so.
 */
export async function POST(request: Request) {
  if (!(await requireAuth())) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }
  if (!(await verifyCsrf(request))) {
    return NextResponse.json({ error: "Invalid CSRF token" }, { status: 403 });
  }

  const formData = await request.formData().catch(() => null);
  const file = formData?.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }
  if (file.size > MAX_SIZE) {
    return NextResponse.json({ error: "File is too large to be a valid database backup" }, { status: 400 });
  }

  const buf = Buffer.from(await file.arrayBuffer());
  const tmpPath = path.join(os.tmpdir(), `status-page-import-${Date.now()}-${process.pid}.db`);
  fs.writeFileSync(tmpPath, buf);

  try {
    const testDb = new Database(tmpPath, { readonly: true, fileMustExist: true });
    let tableNames: Set<string>;
    try {
      tableNames = new Set(
        testDb.prepare("select name from sqlite_master where type = 'table'").all().map((r) => (r as { name: string }).name)
      );
    } finally {
      testDb.close();
    }
    const missing = REQUIRED_TABLES.filter((t) => !tableNames.has(t));
    if (missing.length > 0) {
      fs.rm(tmpPath, { force: true }, () => {});
      return NextResponse.json(
        { error: `This doesn't look like a status page database (missing table${missing.length > 1 ? "s" : ""}: ${missing.join(", ")}).` },
        { status: 400 }
      );
    }
  } catch (err) {
    fs.rm(tmpPath, { force: true }, () => {});
    return NextResponse.json(
      { error: `Uploaded file is not a valid SQLite database: ${err instanceof Error ? err.message : "unknown error"}` },
      { status: 400 }
    );
  }

  const safetyPath = path.join(DATA_DIR, `pre-import-backup-${Date.now()}.db`);
  try {
    await sqlite.backup(safetyPath);
  } catch (err) {
    fs.rm(tmpPath, { force: true }, () => {});
    return NextResponse.json(
      { error: `Could not back up the current database before importing, aborted: ${err instanceof Error ? err.message : "unknown error"}` },
      { status: 500 }
    );
  }

  try {
    sqlite.pragma("wal_checkpoint(TRUNCATE)");
  } catch {
    // Best-effort -- proceed to close/replace regardless.
  }
  sqlite.close();

  fs.copyFileSync(tmpPath, DB_PATH);
  fs.rm(tmpPath, { force: true }, () => {});
  for (const ext of ["-wal", "-shm"]) {
    const p = `${DB_PATH}${ext}`;
    if (fs.existsSync(p)) fs.rmSync(p, { force: true });
  }

  return NextResponse.json({
    ok: true,
    message: `Database imported. The previous database was saved as ${path.basename(safetyPath)} in the data folder. Restart the app now to load the new database -- every page will show errors until you do.`,
  });
}
