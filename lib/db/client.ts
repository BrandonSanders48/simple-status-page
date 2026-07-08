import path from "node:path";
import fs from "node:fs";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema";

const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), "data");
const DB_PATH = process.env.DATABASE_PATH || path.join(DATA_DIR, "app.db");

fs.mkdirSync(DATA_DIR, { recursive: true });

declare global {
  // eslint-disable-next-line no-var
  var __sqlite: Database.Database | undefined;
}

const sqlite = globalThis.__sqlite ?? new Database(DB_PATH);
sqlite.pragma("journal_mode = WAL");
sqlite.pragma("synchronous = NORMAL");
sqlite.pragma("foreign_keys = ON");

if (process.env.NODE_ENV !== "production") {
  globalThis.__sqlite = sqlite;
}

export const db = drizzle(sqlite, { schema });
export { sqlite };
export { DATA_DIR, DB_PATH };
