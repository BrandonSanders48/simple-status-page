import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { requireAuth } from "@/lib/auth";
import { verifyCsrf } from "@/lib/csrf";
import { rateLimit, clientIp } from "@/lib/rateLimit";
import { db } from "@/lib/db/client";
import { proxmoxTargets } from "@/lib/db/schema";
import { listProxmoxVms, startProxmoxVm } from "@/lib/integrations/proxmox";
import { recordFailoverAction } from "@/lib/failoverLog";

const MAX_RANGE = 200;

/**
 * Actually powers on VMs at the DR site -- genuinely consequential, so this re-checks
 * (rather than trusting the client's earlier preview) which VMs currently exist and
 * skips anything already running, and is rate limited on top of the usual auth/CSRF
 * checks since a stray double-submit here isn't just noise like most admin actions.
 */
export async function POST(request: Request) {
  if (!(await requireAuth())) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }
  if (!(await verifyCsrf(request))) {
    return NextResponse.json({ error: "Invalid CSRF token" }, { status: 403 });
  }
  if (!rateLimit(`failover_start:${clientIp(request)}`, 3, 5 * 60 * 1000)) {
    return NextResponse.json({ error: "Too many failover start requests. Please wait and try again." }, { status: 429 });
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
  if (!target.isDr) {
    return NextResponse.json({ error: "That Proxmox target isn't marked as the DR site." }, { status: 400 });
  }

  const cfg = { host: target.host, tokenId: target.tokenId, tokenSecret: target.tokenSecret };
  const listing = await listProxmoxVms(cfg);
  if (!listing.ok) {
    recordFailoverAction({
      action: "start_vms",
      targetName: target.name,
      detail: `VMID ${startId}-${endId}: could not list VMs`,
      outcome: "error",
      errorMessage: listing.error,
    });
    return NextResponse.json({ error: listing.error ?? "Failed to query Proxmox" }, { status: 502 });
  }

  const vms = listing.vms.filter((vm) => vm.vmid >= startId && vm.vmid <= endId).sort((a, b) => a.vmid - b.vmid);

  const results = await Promise.all(
    vms.map(async (vm) => {
      if (vm.status === "running") {
        return { vmid: vm.vmid, name: vm.name, outcome: "already-running" as const };
      }
      const started = await startProxmoxVm(cfg, vm.node, vm.vmid);
      return started.ok
        ? { vmid: vm.vmid, name: vm.name, outcome: "started" as const }
        : { vmid: vm.vmid, name: vm.name, outcome: "error" as const, error: started.error };
    })
  );

  const started = results.filter((r) => r.outcome === "started").length;
  const skipped = results.filter((r) => r.outcome === "already-running").length;
  const errored = results.filter((r) => r.outcome === "error");
  recordFailoverAction({
    action: "start_vms",
    targetName: target.name,
    detail: `VMID ${startId}-${endId}: ${started} started, ${skipped} already running, ${errored.length} error(s)`,
    outcome: errored.length > 0 ? "error" : "success",
    errorMessage: errored[0]?.error,
  });

  return NextResponse.json({ ok: true, results });
}
