import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { verifyCsrf } from "@/lib/csrf";
import { getFullConfig, saveFullConfig, configPayloadSchema } from "@/lib/adminConfig";
import { invalidateStatusCache } from "@/lib/statusCache";
import { invalidateRssCache } from "@/lib/rssCache";
import { invalidateStorageCache } from "@/lib/storageCache";
import { invalidatePbsCache } from "@/lib/pbsCache";
import { invalidateIntegrationsCache } from "@/lib/integrationsCache";

export async function GET() {
  if (!(await requireAuth())) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }
  return NextResponse.json(getFullConfig());
}

export async function PUT(request: Request) {
  if (!(await requireAuth())) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }
  if (!(await verifyCsrf(request))) {
    return NextResponse.json({ error: "Invalid CSRF token" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const parsed = configPayloadSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid configuration", issues: parsed.error.issues }, { status: 400 });
  }

  const saved = saveFullConfig(parsed.data);
  invalidateStatusCache();
  invalidateRssCache();
  invalidateStorageCache();
  invalidatePbsCache();
  invalidateIntegrationsCache();

  return NextResponse.json(saved);
}
