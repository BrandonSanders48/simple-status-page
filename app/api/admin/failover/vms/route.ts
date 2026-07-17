import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { requireAuth } from "@/lib/auth";
import { db } from "@/lib/db/client";
import { proxmoxTargets } from "@/lib/db/schema";
import { listProxmoxVms } from "@/lib/integrations/proxmox";

/** Live (uncached) VM listing for the admin Failover tab's preview step -- lets an
 * admin see exactly which VMs in a given id range exist and whether they're already
 * running before committing to starting anything. */
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

  const target = db.select().from(proxmoxTargets).where(eq(proxmoxTargets.id, targetId)).get();
  if (!target) {
    return NextResponse.json({ error: "Proxmox target not found" }, { status: 404 });
  }
  if (!target.isDr) {
    return NextResponse.json({ error: "That Proxmox target isn't marked as the DR site." }, { status: 400 });
  }

  const result = await listProxmoxVms({ host: target.host, tokenId: target.tokenId, tokenSecret: target.tokenSecret });
  if (!result.ok) {
    return NextResponse.json({ error: result.error ?? "Failed to query Proxmox" }, { status: 502 });
  }

  const vms = result.vms.filter((vm) => vm.vmid >= startId && vm.vmid <= endId).sort((a, b) => a.vmid - b.vmid);
  return NextResponse.json({ ok: true, vms });
}
