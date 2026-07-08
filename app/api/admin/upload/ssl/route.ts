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
  // Private keys come in several legitimate PEM flavors (PKCS#8 "PRIVATE KEY", PKCS#1
  // "RSA PRIVATE KEY", "EC PRIVATE KEY", "ENCRYPTED PRIVATE KEY"); accept any of them.
  const beginRe = type === "cert" ? /-----BEGIN CERTIFICATE-----/ : /-----BEGIN (?:[A-Z]+ )?PRIVATE KEY-----/;
  const endRe = type === "cert" ? /-----END CERTIFICATE-----/ : /-----END (?:[A-Z]+ )?PRIVATE KEY-----/;
  if (!beginRe.test(text) || !endRe.test(text)) {
    return NextResponse.json({ error: `File does not look like a valid PEM ${type}` }, { status: 400 });
  }

  const sslDir = path.join(DATA_DIR, "ssl");
  await fs.mkdir(sslDir, { recursive: true });
  const certPath = path.join(sslDir, "cert.pem");
  const keyPath = path.join(sslDir, "key.pem");
  const targetPath = type === "cert" ? certPath : keyPath;
  const counterpartPath = type === "cert" ? keyPath : certPath;

  // Validate against whatever counterpart already exists BEFORE writing anything to
  // disk, so a mismatched/invalid upload can never clobber the currently-working file.
  const counterpartText = await fs.readFile(counterpartPath, "utf8").catch(() => null);
  let hotSwapped = false;
  if (counterpartText) {
    const certText = type === "cert" ? text : counterpartText;
    const keyText = type === "key" ? text : counterpartText;
    try {
      tls.createSecureContext({ cert: certText, key: keyText }); // throws if mismatched/invalid
    } catch (err) {
      return NextResponse.json(
        { error: `Certificate/key pair failed validation: ${err instanceof Error ? err.message : "unknown error"}` },
        { status: 400 }
      );
    }
    await fs.writeFile(targetPath, text);
    const g = globalThis as unknown as { __httpsServer?: { setSecureContext: (opts: { cert: string; key: string }) => void } };
    if (g.__httpsServer) {
      g.__httpsServer.setSecureContext({ cert: certText, key: keyText });
      hotSwapped = true;
    }
  } else {
    // No counterpart yet, nothing to cross-validate against; store it and wait for the other half.
    await fs.writeFile(targetPath, text);
  }

  return NextResponse.json({ ok: true, hotSwapped });
}
