import { NextResponse } from "next/server";
import path from "node:path";
import fs from "node:fs/promises";
import { requireAuth } from "@/lib/auth";
import { DATA_DIR } from "@/lib/db/client";

async function exists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

export async function GET() {
  if (!(await requireAuth())) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  const sslDir = path.join(DATA_DIR, "ssl");
  const [certExists, keyExists] = await Promise.all([
    exists(path.join(sslDir, "cert.pem")),
    exists(path.join(sslDir, "key.pem")),
  ]);

  return NextResponse.json({ certExists, keyExists });
}
