import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { requireAuth } from "@/lib/auth";
import { verifyCsrf } from "@/lib/csrf";
import { rateLimit, clientIp } from "@/lib/rateLimit";
import { db } from "@/lib/db/client";
import { proxmoxTargets } from "@/lib/db/schema";
import { listProxmoxVms, shutdownProxmoxVm } from "@/lib/integrations/proxmox";

const MAX_RANGE = 200;

/**
 * Gracefully shuts down VMs at the primary site -- the other half of a manual
 * failover alongside /api/admin/failover/start. Only ever targets a non-DR
 * ("primary") Proxmox cluster (the inverse restriction of the start route), re-checks
 * which VMs currently exist and skips anything already stopped, and is rate limited
 * since powering off production VMs shouldn't be repeatable by a stray double-submit.
 */
export async function POST(request: Request) {
  if (!(await requireAuth())) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }
  if (!(await verifyCsrf(request))) {
    return NextResponse.json({ error: "Invalid CSRF token" }, { status: 403 });
  }
  if (!rateLimit(`failover_shutdown:${clientIp(request)}`, 3, 5 * 60 * 1000)) {
    return NextResponse.json({ error: "Too many failover shutdown requests. Please wait and try again." }, { status: 429 });
  }

  const body = await request.json().catch(() => null);
  const targetId = Number(body?.targetId);
  const startId = Number(body?.startId);
  const endId = Number(body?.endId);
  if (
    !Number.isInteger(targetId) ||
    !Number.isInteger(startId) ||
    !Number.isInteger(endId) ||
    startId < 0 ||
    endId < startId ||
    endId - startId + 1 > MAX_RANGE
  ) {
    return NextResponse.json({ error: `targetId, startId, and endId are required (range up to ${MAX_RANGE} VMs).` }, { status: 400 });
  }

  const target = db.select().from(proxmoxTargets).where(eq(proxmoxTargets.id, targetId)).get();
  if (!target) {
    return NextResponse.json({ error: "Proxmox target not found" }, { status: 404 });
  }
  if (target.isDr) {
    return NextResponse.json(
      { error: "That Proxmox target is marked as the DR site -- pick a primary (non-DR) cluster to shut down." },
      { status: 400 }
    );
  }

  const cfg = { host: target.host, tokenId: target.tokenId, tokenSecret: target.tokenSecret };
  const listing = await listProxmoxVms(cfg);
  if (!listing.ok) {
    return NextResponse.json({ error: listing.error ?? "Failed to query Proxmox" }, { status: 502 });
  }

  const vms = listing.vms.filter((vm) => vm.vmid >= startId && vm.vmid <= endId).sort((a, b) => a.vmid - b.vmid);

  const results = await Promise.all(
    vms.map(async (vm) => {
      if (vm.status !== "running") {
        return { vmid: vm.vmid, name: vm.name, outcome: "already-stopped" as const };
      }
      const stopped = await shutdownProxmoxVm(cfg, vm.node, vm.vmid);
      return stopped.ok
        ? { vmid: vm.vmid, name: vm.name, outcome: "shutdown" as const }
        : { vmid: vm.vmid, name: vm.name, outcome: "error" as const, error: stopped.error };
    })
  );

  return NextResponse.json({ ok: true, results });
}
