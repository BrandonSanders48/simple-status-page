import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { getIntegrationTarget } from "@/lib/integrationTargets";
import { listProxmoxVms } from "@/lib/integrations/proxmox";

/** Live (uncached) VM listing for the admin Failover tab's preview step -- used by
 * both the "start at DR" and "shut down at primary" actions, so any Proxmox target
 * can be listed here (the destructive action routes are what actually restrict which
 * target -- DR-only or primary-only -- rather than this read-only listing). */
export async function GET(request: Request) {
  if (!(await requireAuth())) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  const url = new URL(request.url);
  const targetId = Number(url.searchParams.get("targetId"));
  const startId = Number(url.searchParams.get("start"));
  const endId = Number(url.searchParams.get("end"));
  if (!Number.isInteger(targetId) || !Number.isInteger(startId) || !Number.isInteger(endId) || startId < 0 || endId < startId) {
    return NextResponse.json({ error: "targetId, start, and end are required (end >= start >= 0)." }, { status: 400 });
  }

  const target = getIntegrationTarget(targetId, "proxmox");
  if (!target) {
    return NextResponse.json({ error: "Proxmox target not found" }, { status: 404 });
  }

  const result = await listProxmoxVms({
    host: target.config.host ?? "",
    tokenId: target.config.tokenId ?? "",
    tokenSecret: target.config.tokenSecret ?? "",
  });
  if (!result.ok) {
    return NextResponse.json({ error: result.error ?? "Failed to query Proxmox" }, { status: 502 });
  }

  const vms = result.vms.filter((vm) => vm.vmid >= startId && vm.vmid <= endId).sort((a, b) => a.vmid - b.vmid);
  return NextResponse.json({ ok: true, vms });
}
