import { NextResponse } from "next/server";
import { verifyCsrf } from "@/lib/csrf";
import { rateLimit, clientIp } from "@/lib/rateLimit";
import { checkPing } from "@/lib/checks/ping";
import { checkDns } from "@/lib/checks/dns";
import { checkTcpDetailed, type TcpFailureReason } from "@/lib/checks/tcp";
import { checkNtp } from "@/lib/checks/ntp";
import { checkDhcp } from "@/lib/checks/dhcp";
import { checkRadius } from "@/lib/checks/radius";
import { db } from "@/lib/db/client";
import { networkTestLog } from "@/lib/db/schema";

const REASON_TEXT: Record<TcpFailureReason, string> = {
  refused: "Connection refused -- host is up, but nothing's listening on this port",
  timeout: "No response within the timeout -- likely a firewall silently dropping it",
  dns: "Hostname didn't resolve",
  unreachable: "Network unreachable -- a routing problem before even reaching the host",
  other: "Connection failed",
};

type CheckOutcome = { ok: boolean | null; detail?: string };

/** Standard Active Directory / domain-controller port battery -- covers the services
 * an AD-integrated app typically depends on: name resolution, time sync (Kerberos
 * fails outright on >5min clock skew, so NTP is directly diagnostic of "why is
 * Kerberos broken"), authentication (Kerberos, RADIUS/NPS), and directory/network
 * config lookups (LDAP, SMB, Global Catalog, DHCP). Not exhaustive (e.g. no RPC
 * endpoint mapper), but the common set worth checking when diagnosing "why can't
 * this box talk to my DC".
 *
 * `ok: null` means inconclusive, not a confirmed failure -- DHCP and RADIUS/NPS
 * can't give a definitive "down" from a plain UDP probe like NTP can: a DHCP server
 * normally only unicasts a reply by ARPing the offered address or via broadcast
 * (RFC 2131), and NPS only replies to requests from IPs it has configured as known
 * RADIUS clients -- from anywhere else (almost certainly including this server),
 * both silently drop the probe with no reply, which looks identical to "not
 * running". A reply is trusted as a real "yes"; no reply is shown as inconclusive
 * rather than misreported as an outage. See lib/checks/dhcp.ts and radius.ts.
 */
const CHECKS: { name: string; port: number | null; run: (host: string) => Promise<CheckOutcome> }[] = [
  { name: "Ping (ICMP)", port: null, run: async (host) => ({ ok: await checkPing(host) }) },
  { name: "DNS", port: 53, run: async (host) => ({ ok: await checkDns(host, 53) }) },
  { name: "NTP", port: 123, run: async (host) => ({ ok: await checkNtp(host) }) },
  {
    name: "Kerberos",
    port: 88,
    run: async (host) => {
      const r = await checkTcpDetailed(host, 88);
      return { ok: r.ok, detail: r.reason && REASON_TEXT[r.reason] };
    },
  },
  {
    name: "NPS / RADIUS",
    port: 1812,
    run: async (host) => ({
      ok: await checkRadius(host),
      detail: "No reply doesn't necessarily mean it's down -- NPS silently ignores requests from IPs it hasn't configured as a RADIUS client",
    }),
  },
  {
    name: "DHCP",
    port: 67,
    run: async (host) => ({
      ok: await checkDhcp(host),
      detail: "No reply doesn't necessarily mean it's down -- DHCP servers often can't unicast a reply back to a non-relay probe like this one",
    }),
  },
  {
    name: "LDAP",
    port: 389,
    run: async (host) => {
      const r = await checkTcpDetailed(host, 389);
      return { ok: r.ok, detail: r.reason && REASON_TEXT[r.reason] };
    },
  },
  {
    name: "SMB",
    port: 445,
    run: async (host) => {
      const r = await checkTcpDetailed(host, 445);
      return { ok: r.ok, detail: r.reason && REASON_TEXT[r.reason] };
    },
  },
  {
    name: "LDAPS",
    port: 636,
    run: async (host) => {
      const r = await checkTcpDetailed(host, 636);
      return { ok: r.ok, detail: r.reason && REASON_TEXT[r.reason] };
    },
  },
  {
    name: "Global Catalog",
    port: 3268,
    run: async (host) => {
      const r = await checkTcpDetailed(host, 3268);
      return { ok: r.ok, detail: r.reason && REASON_TEXT[r.reason] };
    },
  },
  {
    name: "Global Catalog (SSL)",
    port: 3269,
    run: async (host) => {
      const r = await checkTcpDetailed(host, 3269);
      return { ok: r.ok, detail: r.reason && REASON_TEXT[r.reason] };
    },
  },
];

/**
 * Ad-hoc network diagnostic: runs a fixed battery of AD/DC-style checks against a
 * caller-supplied host, timing each one. Not tied to any configured service --
 * purely a troubleshooting tool.
 *
 * Deliberately open to any visitor (no requireAuth), by request -- which means this
 * endpoint makes the server connect to whatever host/port a caller names. That's a
 * real SSRF/scanning-proxy surface (probing this server's internal network, or using
 * it to port-scan other targets while hiding the caller's origin), so it's rate
 * limited per IP to bound abuse; CSRF is still checked to stop cross-site triggering.
 */
export async function POST(request: Request) {
  if (!(await verifyCsrf(request))) {
    return NextResponse.json({ error: "Invalid CSRF token" }, { status: 403 });
  }
  if (!rateLimit(`test-network:${clientIp(request)}`, 10, 5 * 60 * 1000)) {
    return NextResponse.json({ error: "Too many network tests. Please wait and try again." }, { status: 429 });
  }

  const body = await request.json().catch(() => null);
  const host = typeof body?.host === "string" ? body.host.trim() : "";
  if (!host) {
    return NextResponse.json({ error: "Host is required" }, { status: 400 });
  }

  const results = await Promise.all(
    CHECKS.map(async (c) => {
      const startedAt = Date.now();
      const outcome = await c.run(host).catch((): CheckOutcome => ({ ok: false }));
      // Show `detail` whenever it's not a clean pass -- including `ok === null`
      // (inconclusive), which is exactly when the "this doesn't necessarily mean
      // it's down" caveat for DHCP/RADIUS matters most.
      return { name: c.name, port: c.port, ok: outcome.ok, detail: outcome.ok === true ? undefined : outcome.detail, ms: Date.now() - startedAt };
    })
  );

  // Audit trail -- this endpoint is reachable without sign-in and makes the server
  // connect to whatever host a caller names, so who ran what, when, from where, is
  // worth keeping. `clientIp` is whatever the server actually sees the request
  // arrive from (see the networkTestLog schema comment for what that does and
  // doesn't guarantee about it being the caller's real LAN IP).
  db.insert(networkTestLog)
    .values({
      host,
      clientIp: clientIp(request),
      okCount: results.filter((r) => r.ok === true).length,
      failCount: results.filter((r) => r.ok === false).length,
      inconclusiveCount: results.filter((r) => r.ok === null).length,
    })
    .run();

  return NextResponse.json({ host, results });
}
