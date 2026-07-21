import { fetch as undiciFetch } from "undici";
import { insecureAgent } from "@/lib/insecureAgent";

export function httpSchemeFor(type: string, port: number): "http" | "https" {
  if (type.toLowerCase().includes("https")) return "https";
  if (port === 443) return "https";
  return "http";
}

export function isHttpType(type: string): boolean {
  return type.toLowerCase().includes("http");
}

/**
 * Real HTTP(S) health check: a service only counts as up if it actually returns a
 * non-5xx response, not merely if the TCP port accepts a connection - a webserver or
 * reverse proxy can keep accepting connections while the application behind it errors.
 */
export async function checkHttp(
  host: string,
  port: number,
  scheme: "http" | "https" = "http",
  timeoutMs = 4000
): Promise<boolean> {
  try {
    const res = await undiciFetch(`${scheme}://${host}:${port}/`, {
      signal: AbortSignal.timeout(timeoutMs),
      dispatcher: insecureAgent,
      redirect: "follow",
    });
    return res.status > 0 && res.status < 500;
  } catch {
    return false;
  }
}
