import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { readNotificationLog } from "@/lib/notifyLog";

/** Read-only view of lib/notifyLog.ts's plain-text SMS send log, for the Admin >
 * Notifications page - lets an admin confirm whether a text actually sent (and why
 * not, if it didn't) without needing server console access. */
export async function GET() {
  if (!(await requireAuth())) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }
  return NextResponse.json({ lines: readNotificationLog() });
}
