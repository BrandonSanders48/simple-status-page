import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { verifyCsrf } from "@/lib/csrf";
import { fetchPbsStatus } from "@/lib/integrations/pbs";

/** Live (uncached) connection test for the admin Backups tab, mirroring test-storage. */
export async function POST(request: Request) {
  if (!(await requireAuth())) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }
  if (!(await verifyCsrf(request))) {
    return NextResponse.json({ error: "Invalid CSRF token" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const host = typeof body?.host === "string" ? body.host.trim() : "";
  const tokenId = typeof body?.tokenId === "string" ? body.tokenId : "";
  const tokenSecret = typeof body?.tokenSecret === "string" ? body.tokenSecret : "";
  if (!host || !tokenId || !tokenSecret) {
    return NextResponse.json({ error: "Host, token ID, and token secret are required." }, { status: 400 });
  }

  const result = await fetchPbsStatus({ host, tokenId, tokenSecret });
  if (!result.ok) {
    return NextResponse.json({ error: result.error ?? "Failed to connect to Proxmox Backup Server" }, { status: 502 });
  }

  const diagnosticsText = result.diagnostics.length > 0 ? ` (${result.diagnostics.join("; ")})` : "";
  const summary =
    result.tasks.length === 0
      ? `Connected, but no backup tasks were found.${diagnosticsText}`
      : `Last backup run: ${result.lastRunHealthy ? "all OK" : "had failures"} (${result.tasks.length} task(s)).${diagnosticsText}`;

  return NextResponse.json({ ok: true, summary });
}
