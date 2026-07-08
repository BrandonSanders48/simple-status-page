import { NextResponse } from "next/server";
import path from "node:path";
import fs from "node:fs/promises";
import tls from "node:tls";
import { requireAuth } from "@/lib/auth";
import { verifyCsrf } from "@/lib/csrf";
import { DATA_DIR } from "@/lib/db/client";

const MAX_SIZE = 64 * 1024; // certs/keys are small text files

export async function POST(request: Request) {
  if (!(await requireAuth())) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }
  if (!(await verifyCsrf(request))) {
    return NextResponse.json({ error: "Invalid CSRF token" }, { status: 403 });
  }

  const formData = await request.formData().catch(() => null);
  const type = formData?.get("type");
  const file = formData?.get("file");
  if (type !== "cert" && type !== "key") {
    return NextResponse.json({ error: "type must be 'cert' or 'key'" }, { status: 400 });
  }
  if (!(file instanceof File) || file.size === 0 || file.size > MAX_SIZE) {
    return NextResponse.json({ error: "Invalid file" }, { status: 400 });
  }

  const text = await file.text();
  const marker = type === "cert" ? "CERTIFICATE" : "PRIVATE KEY";
  if (!text.includes(`BEGIN ${marker}`) || !text.includes(`END ${marker}`)) {
    return NextResponse.json({ error: `File does not look like a valid PEM ${type}` }, { status: 400 });
  }

  const sslDir = path.join(DATA_DIR, "ssl");
  await fs.mkdir(sslDir, { recursive: true });
  const certPath = path.join(sslDir, "cert.pem");
  const keyPath = path.join(sslDir, "key.pem");
  const targetPath = type === "cert" ? certPath : keyPath;
  await fs.writeFile(targetPath, text);

  // If both halves are now present, validate them together and hot-swap the running
  // HTTPS listener so an upload doesn't silently break TLS on next restart.
  let hotSwapped = false;
  try {
    const [certText, keyText] = await Promise.all([
      fs.readFile(certPath, "utf8").catch(() => null),
      fs.readFile(keyPath, "utf8").catch(() => null),
    ]);
    if (certText && keyText) {
      tls.createSecureContext({ cert: certText, key: keyText }); // throws if mismatched/invalid
      const g = globalThis as unknown as { __httpsServer?: { setSecureContext: (opts: { cert: string; key: string }) => void } };
      if (g.__httpsServer) {
        g.__httpsServer.setSecureContext({ cert: certText, key: keyText });
        hotSwapped = true;
      }
    }
  } catch (err) {
    return NextResponse.json(
      { error: `Certificate/key pair failed validation: ${err instanceof Error ? err.message : "unknown error"}` },
      { status: 400 }
    );
  }

  return NextResponse.json({ ok: true, hotSwapped });
}
