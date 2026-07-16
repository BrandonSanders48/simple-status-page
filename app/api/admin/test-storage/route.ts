import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { verifyCsrf } from "@/lib/csrf";
import { fetchPowerstoreStatus } from "@/lib/integrations/powerstore";
import { fetchProxmoxStorageStatus } from "@/lib/integrations/proxmox";

/** Live (uncached) connection test for the admin Storage tab -- separate from the
 * cached /api/storage endpoint the public panel polls, so "Test Connection" always
 * reflects the credentials currently being edited, not a stale cache entry. */
export async function POST(request: Request) {
  if (!(await requireAuth())) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }
  if (!(await verifyCsrf(request))) {
    return NextResponse.json({ error: "Invalid CSRF token" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const target = body?.target;

  if (target === "powerstore") {
    const host = typeof body?.host === "string" ? body.host.trim() : "";
    const username = typeof body?.username === "string" ? body.username : "";
    const password = typeof body?.password === "string" ? body.password : "";
    if (!host || !username || !password) {
      return NextResponse.json({ error: "Host, username, and password are required." }, { status: 400 });
    }

    const result = await fetchPowerstoreStatus({ host, username, password });
    if (!result.ok) {
      return NextResponse.json({ error: result.error ?? "Failed to connect to PowerStore" }, { status: 502 });
    }
    const diagnosticsText = result.diagnostics.length > 0 ? ` (${result.diagnostics.join("; ")})` : "";
    return NextResponse.json({
      ok: true,
      summary: `Cluster "${result.clusterName ?? "unknown"}" (${result.clusterState ?? "unknown state"}) — ${result.alerts.length} active alert(s), ${result.metroSessions.length} Metro session(s).${diagnosticsText}`,
    });
  }

  if (target === "proxmox") {
    const host = typeof body?.host === "string" ? body.host.trim() : "";
    const tokenId = typeof body?.tokenId === "string" ? body.tokenId : "";
    const tokenSecret = typeof body?.tokenSecret === "string" ? body.tokenSecret : "";
    const storageId = typeof body?.storageId === "string" ? body.storageId : null;
    if (!host || !tokenId || !tokenSecret) {
      return NextResponse.json({ error: "Host, token ID, and token secret are required." }, { status: 400 });
    }

    const result = await fetchProxmoxStorageStatus({ host, tokenId, tokenSecret, storageId });
    if (!result.ok) {
      return NextResponse.json({ error: result.error ?? "Failed to connect to Proxmox" }, { status: 502 });
    }
    return NextResponse.json({
      ok: true,
      summary:
        result.storages.length > 0
          ? `Found ${result.storages.length} matching storage entr${result.storages.length === 1 ? "y" : "ies"} across the cluster.`
          : "Connected, but no matching storage entries were found — check the Storage ID.",
    });
  }

  return NextResponse.json({ error: "Unknown target" }, { status: 400 });
}
