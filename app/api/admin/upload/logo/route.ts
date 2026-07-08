import { NextResponse } from "next/server";
import path from "node:path";
import fs from "node:fs/promises";
import crypto from "node:crypto";
import { eq } from "drizzle-orm";
import { requireAuth } from "@/lib/auth";
import { verifyCsrf } from "@/lib/csrf";
import { db, DATA_DIR } from "@/lib/db/client";
import { settings } from "@/lib/db/schema";

const ALLOWED_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/gif": "gif",
  "image/webp": "webp",
  "image/svg+xml": "svg",
};
const MAX_SIZE = 2 * 1024 * 1024; // 2MB

export async function POST(request: Request) {
  if (!(await requireAuth())) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }
  if (!(await verifyCsrf(request))) {
    return NextResponse.json({ error: "Invalid CSRF token" }, { status: 403 });
  }

  const formData = await request.formData().catch(() => null);
  const file = formData?.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
  }
  if (file.size > MAX_SIZE) {
    return NextResponse.json({ error: "File too large (max 2MB)" }, { status: 400 });
  }
  const ext = ALLOWED_TYPES[file.type];
  if (!ext) {
    return NextResponse.json({ error: "Unsupported file type" }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const hash = crypto.createHash("sha1").update(buffer).digest("hex").slice(0, 12);
  const filename = `logo-${hash}.${ext}`;
  const uploadsDir = path.join(DATA_DIR, "uploads");
  await fs.mkdir(uploadsDir, { recursive: true });
  await fs.writeFile(path.join(uploadsDir, filename), buffer);

  const publicPath = `/api/assets/${filename}`;
  db.update(settings).set({ businessLogoPath: publicPath }).where(eq(settings.id, 1)).run();

  return NextResponse.json({ ok: true, path: publicPath });
}
