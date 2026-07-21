import { NextResponse } from "next/server";
import path from "node:path";
import fs from "node:fs/promises";
import tls from "node:tls";
import { requireAuth } from "@/lib/auth";
import { verifyCsrf } from "@/lib/csrf";
import { DATA_DIR } from "@/lib/db/client";

const MAX_SIZE = 64 * 1024; // certs/keys are small text files
const PENDING_TTL_MS = 15 * 60 * 1000; // abandon a half-finished pair swap after 15min

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
  const pendingCertPath = path.join(sslDir, "cert.pending.pem");
  const pendingKeyPath = path.join(sslDir, "key.pending.pem");
  const selfSignedMarkerPath = path.join(sslDir, ".self-signed");
  const targetPendingPath = type === "cert" ? pendingCertPath : pendingKeyPath;
  const activeCounterpartPath = type === "cert" ? keyPath : certPath;

  async function clearPending() {
    await fs.rm(pendingCertPath, { force: true });
    await fs.rm(pendingKeyPath, { force: true });
  }

  async function promote(certText: string, keyText: string): Promise<boolean> {
    await fs.writeFile(certPath, certText);
    await fs.writeFile(keyPath, keyText);
    await clearPending();
    // This is now a real uploaded pair, not the entrypoint's self-signed fallback.
    await fs.rm(selfSignedMarkerPath, { force: true });
    const g = globalThis as unknown as { __httpsServer?: { setSecureContext: (opts: { cert: string; key: string }) => void } };
    if (g.__httpsServer) {
      g.__httpsServer.setSecureContext({ cert: certText, key: keyText });
      return true;
    }
    return false;
  }

  // A pending counterpart from a swap already in progress takes priority over whatever's
  // currently active, but only if it's recent - an abandoned upload from a stale, never-
  // completed attempt shouldn't linger around and unexpectedly pair with a new upload.
  const pendingCounterpartPath = type === "cert" ? pendingKeyPath : pendingCertPath;
  const pendingStat = await fs.stat(pendingCounterpartPath).catch(() => null);
  const pendingCounterpartText =
    pendingStat && Date.now() - pendingStat.mtimeMs < PENDING_TTL_MS
      ? await fs.readFile(pendingCounterpartPath, "utf8").catch(() => null)
      : null;

  if (pendingCounterpartText) {
    const certText = type === "cert" ? text : pendingCounterpartText;
    const keyText = type === "key" ? text : pendingCounterpartText;
    try {
      tls.createSecureContext({ cert: certText, key: keyText });
    } catch (err) {
      await clearPending();
      return NextResponse.json(
        { error: `Certificate/key pair failed validation: ${err instanceof Error ? err.message : "unknown error"}` },
        { status: 400 }
      );
    }
    const hotSwapped = await promote(certText, keyText);
    return NextResponse.json({ ok: true, hotSwapped });
  }

  // No pair swap in progress. If this upload matches whatever's currently active, treat it
  // as a single-file renewal (e.g. a renewed cert reusing the same key) and apply directly.
  const activeCounterpartText = await fs.readFile(activeCounterpartPath, "utf8").catch(() => null);
  if (activeCounterpartText) {
    const certText = type === "cert" ? text : activeCounterpartText;
    const keyText = type === "key" ? text : activeCounterpartText;
    try {
      tls.createSecureContext({ cert: certText, key: keyText });
      const hotSwapped = await promote(certText, keyText);
      return NextResponse.json({ ok: true, hotSwapped });
    } catch {
      // Doesn't match what's active - this is the first half of a full pair swap. Stage
      // it and wait for the matching other half, rather than rejecting outright.
      await fs.writeFile(targetPendingPath, text);
      return NextResponse.json({ ok: true, hotSwapped: false, pending: true });
    }
  }

  // Nothing active or pending to validate against at all; just stage it.
  await fs.writeFile(targetPendingPath, text);
  return NextResponse.json({ ok: true, hotSwapped: false, pending: true });
}
