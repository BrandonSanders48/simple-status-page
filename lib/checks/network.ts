import { checkPing } from "./ping";
import { checkDns } from "./dns";

export interface NetworkStatus {
  ok: boolean | null; // null = not configured
  text: string;
}

/** Local-area status: ICMP ping to the configured gateway. */
export async function checkLocalNetwork(gatewayHost: string | null): Promise<NetworkStatus> {
  if (!gatewayHost) return { ok: null, text: "Not configured" };
  const ok = await checkPing(gatewayHost);
  return { ok, text: ok ? "Operational" : "Failure" };
}

/** Wide-area status: a real DNS query to the configured public resolver, plus ISP lookup. */
export async function checkWideNetwork(
  publicDnsHost: string | null,
  publicIp: string,
  ispName: string | null
): Promise<NetworkStatus> {
  if (!publicDnsHost) return { ok: null, text: "Not configured" };
  const ok = await checkDns(publicDnsHost, 53);
  const ispLabel = publicIp ? (ispName ? `${ispName} (${publicIp})` : `Unknown ISP (${publicIp})`) : "IP unavailable";
  return { ok, text: `${ispLabel}: ${ok ? "Operational" : "Failure"}` };
}

export async function getPublicIp(): Promise<string> {
  try {
    const res = await fetch("https://api.ipify.org", { signal: AbortSignal.timeout(3000) });
    if (!res.ok) return "";
    const ip = (await res.text()).trim();
    return /^[0-9a-fA-F:.]+$/.test(ip) ? ip : "";
  } catch {
    return "";
  }
}
