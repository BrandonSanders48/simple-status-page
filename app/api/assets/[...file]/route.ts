import { NextResponse } from "next/server";
import path from "node:path";
import fs from "node:fs/promises";
import { DATA_DIR } from "@/lib/db/client";

const MIME_TYPES: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
};

export async function GET(_request: Request, { params }: { params: Promise<{ file: string[] }> }) {
  const { file } = await params;
  // Reject any path-traversal attempt outright rather than trying to sanitize it.
  if (file.some((segment) => segment.includes("..") || segment.includes("/") || segment.includes("\\"))) {
    return NextResponse.json({ error: "Invalid path" }, { status: 400 });
  }

  const uploadsDir = path.join(DATA_DIR, "uploads");
  const filePath = path.join(uploadsDir, ...file);
  if (!filePath.startsWith(uploadsDir)) {
    return NextResponse.json({ error: "Invalid path" }, { status: 400 });
  }

  try {
    const data = await fs.readFile(filePath);
    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] ?? "application/octet-stream";
    return new NextResponse(new Uint8Array(data), {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
}
