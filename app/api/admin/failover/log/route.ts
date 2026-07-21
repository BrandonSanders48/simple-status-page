import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { getRecentFailoverActions } from "@/lib/failoverLog";

/** Recent Failover tab actions (start/shutdown VMs, promote/reprotect Metro) for the
 * admin-only audit list - most recent first. */
export async function GET() {
  if (!(await requireAuth())) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }
  return NextResponse.json({ actions: getRecentFailoverActions(20) });
}
