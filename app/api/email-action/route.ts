import { NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { incidents } from "@/lib/db/schema";
import { getActionToken, consumeActionToken } from "@/lib/emailTokens";

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
    return NextResponse.redirect(new URL("/email-action", request.url));
  }

  const payload = getActionToken(token);
  if (!payload) {
    return NextResponse.redirect(new URL("/email-action", request.url));
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

  const doneUrl = new URL("/email-action/done", request.url);
  doneUrl.searchParams.set("type", payload.action);
  doneUrl.searchParams.set("service", payload.serviceName);
  return NextResponse.redirect(doneUrl, 303);
}
