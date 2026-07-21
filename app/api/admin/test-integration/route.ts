import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { verifyCsrf } from "@/lib/csrf";
import { getIntegrationCatalogEntry } from "@/lib/integrationRegistry";

/** Live (uncached) connection test for the admin Integrations marketplace - mirrors
 * /api/admin/test-storage, dispatching to whichever integration's fetchStatus by key
 * rather than a fixed target/proxmox branch, since the catalog is open-ended. */
export async function POST(request: Request) {
  if (!(await requireAuth())) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }
  if (!(await verifyCsrf(request))) {
    return NextResponse.json({ error: "Invalid CSRF token" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const integration = typeof body?.integration === "string" ? body.integration : "";
  const config = typeof body?.config === "object" && body.config !== null ? body.config : {};

  const entry = getIntegrationCatalogEntry(integration);
  if (!entry) {
    return NextResponse.json({ error: `Unknown integration "${integration}"` }, { status: 400 });
  }

  const result = await entry.fetchStatus(config);
  if (!result.ok) {
    return NextResponse.json({ error: result.error ?? `Failed to connect to ${entry.label}` }, { status: 502 });
  }

  const diagnosticsText = result.diagnostics.length > 0 ? ` (${result.diagnostics.join("; ")})` : "";
  return NextResponse.json({ ok: true, summary: `${result.summary}${diagnosticsText}` });
}
