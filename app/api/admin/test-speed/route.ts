import { NextResponse } from "next/server";
import { verifyCsrf } from "@/lib/csrf";
import { rateLimit, clientIp } from "@/lib/rateLimit";
import { runSpeedTest } from "@/lib/checks/speedtest";

/**
 * WAN download/upload speed test against Cloudflare's public speed-test backend --
 * see lib/checks/speedtest.ts. Unlike /api/admin/test-network's instant reachability
 * checks, this transfers real data (~15MB total) and takes a few seconds, so it's a
 * separate, manually-triggered endpoint rather than something that runs
 * automatically -- nobody wants a diagnostic panel eating bandwidth just from being
 * opened. Reachable without sign-in (same as test-network), but rate limited
 * tighter given the bandwidth cost of each run.
 */
export async function POST(request: Request) {
  if (!(await verifyCsrf(request))) {
    return NextResponse.json({ error: "Invalid CSRF token" }, { status: 403 });
  }
  if (!rateLimit(`test-speed:${clientIp(request)}`, 3, 5 * 60 * 1000)) {
    return NextResponse.json({ error: "Too many speed tests. Please wait and try again." }, { status: 429 });
  }

  const result = await runSpeedTest();
  return NextResponse.json(result);
}
