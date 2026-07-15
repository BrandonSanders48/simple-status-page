import { NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { incidents, settings } from "@/lib/db/schema";
import { getActionToken, consumeActionToken } from "@/lib/emailTokens";
import { resolvePageUrl } from "@/lib/pageUrl";

/**
 * Builds an absolute redirect target from the configured public page URL rather than
 * `request.url` -- behind a reverse proxy that doesn't forward the original Host, the
 * request as seen by this server can carry an internal hostname/port, which would
 * otherwise redirect the subscriber's browser to an address only reachable from inside
 * the network.
 */
function redirectTarget(path: string, request: Request): URL {
  const cfg = db.select().from(settings).get();
  const base = cfg ? resolvePageUrl(cfg) : null;
  return new URL(path, base ?? request.url);
}

/**
 * Performs the mutation half of the email action-link flow. Deliberately POST-only
 * (the confirm page is a plain GET render) so corporate email-security link
 * prefetchers, which follow GET links automatically, can't trigger an action just by
 * scanning the email.
 */
export async function POST(request: Request) {
  const formData = await request.formData().catch(() => null);
  const token = formData?.get("token");
  if (typeof token !== "string" || !token) {
    return NextResponse.redirect(redirectTarget("/email-action", request));
  }

  const payload = getActionToken(token);
  if (!payload) {
    return NextResponse.redirect(redirectTarget("/email-action", request));
  }
  consumeActionToken(token);

  const now = new Date().toISOString().slice(0, 16);
  if (payload.action === "wip") {
    db.insert(incidents)
      .values({
        title: `${payload.serviceName} - Work in Progress`,
        description: "Our team is actively investigating and working to resolve this issue.",
        severity: "degraded",
        startTime: now,
        endTime: null,
      })
      .run();
  } else {
    db.insert(incidents)
      .values({
        title: `${payload.serviceName} - Resolved`,
        description: `The issue affecting ${payload.serviceName} has been resolved.`,
        severity: "resolved",
        startTime: now,
        endTime: now,
      })
      .run();
  }

  const doneUrl = redirectTarget("/email-action/done", request);
  doneUrl.searchParams.set("type", payload.action);
  doneUrl.searchParams.set("service", payload.serviceName);
  return NextResponse.redirect(doneUrl, 303);
}
