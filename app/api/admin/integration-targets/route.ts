import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { verifyCsrf } from "@/lib/csrf";
import { getIntegrationTargets, saveIntegrationTargets, integrationTargetsPayloadSchema } from "@/lib/adminConfig";
import { invalidateStorageCache } from "@/lib/storageCache";
import { invalidatePbsCache } from "@/lib/pbsCache";
import { invalidateIntegrationsCache } from "@/lib/integrationsCache";

/** Backs the standalone /admin/integrations page -- scoped to just the
 * integration_targets table so it can't touch settings/services/rssFeeds/ispMap/
 * statusCategories, unlike /api/admin/config's full-payload save. */
export async function GET() {
  if (!(await requireAuth())) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }
  return NextResponse.json({ integrationTargets: getIntegrationTargets() });
}

export async function PUT(request: Request) {
  if (!(await requireAuth())) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }
  if (!(await verifyCsrf(request))) {
    return NextResponse.json({ error: "Invalid CSRF token" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const parsed = integrationTargetsPayloadSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid configuration", issues: parsed.error.issues }, { status: 400 });
  }

  const saved = saveIntegrationTargets(parsed.data.integrationTargets);
  invalidateStorageCache();
  invalidatePbsCache();
  invalidateIntegrationsCache();

  return NextResponse.json({ integrationTargets: saved });
}
