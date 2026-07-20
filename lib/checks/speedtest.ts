import { fetch as undiciFetch } from "undici";

// Cloudflare's public speed-test backend (speed.cloudflare.com) -- the same
// infrastructure their own speed test page and several open-source CLI speed-test
// tools use. Confirmed directly: GET __down?bytes=N returns exactly N bytes; POST
// __up accepts a body of any size and returns 200 once fully received. No auth,
// no API key -- it's designed to be hit anonymously.
const DOWNLOAD_BYTES = 10_000_000; // 10MB -- big enough that TLS handshake/connection
// setup overhead doesn't dominate the timing, without taking more than a couple
// seconds on a typical connection.
const UPLOAD_BYTES = 5_000_000; // Smaller than download -- most connections are more
// asymmetric (slower upload), and this is meant to finish in a few seconds either way.

function mbps(bytes: number, ms: number): number {
  return (bytes * 8) / (ms / 1000) / 1_000_000;
}

export interface SpeedTestResult {
  downloadMbps: number | null;
  uploadMbps: number | null;
  error?: string;
}

/**
 * Real download/upload throughput test against Cloudflare's speed-test backend --
 * not a reachability check like the rest of this app's network diagnostics, an
 * actual timed data transfer. Download and upload run sequentially (not in
 * parallel), so neither one's bandwidth usage skews the other's measurement.
 */
export async function runSpeedTest(timeoutMs = 15000): Promise<SpeedTestResult> {
  let downloadMbps: number | null = null;
  let uploadMbps: number | null = null;
  let error: string | undefined;

  try {
    const start = Date.now();
    const res = await undiciFetch(`https://speed.cloudflare.com/__down?bytes=${DOWNLOAD_BYTES}`, {
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) throw new Error(`Download test returned HTTP ${res.status}`);
    const buf = await res.arrayBuffer();
    downloadMbps = mbps(buf.byteLength, Date.now() - start);
  } catch (err) {
    error = err instanceof Error ? `Download: ${err.message}` : "Download test failed";
  }

  try {
    const body = new Uint8Array(UPLOAD_BYTES);
    crypto.getRandomValues(body.subarray(0, Math.min(UPLOAD_BYTES, 65536))); // a little real randomness is enough; the rest can be zeros -- Cloudflare just measures transfer time, not entropy
    const start = Date.now();
    const res = await undiciFetch("https://speed.cloudflare.com/__up", {
      method: "POST",
      body,
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) throw new Error(`Upload test returned HTTP ${res.status}`);
    uploadMbps = mbps(UPLOAD_BYTES, Date.now() - start);
  } catch (err) {
    error = error ? `${error}; ` + (err instanceof Error ? `Upload: ${err.message}` : "Upload test failed") : err instanceof Error ? `Upload: ${err.message}` : "Upload test failed";
  }

  return { downloadMbps, uploadMbps, error };
}
