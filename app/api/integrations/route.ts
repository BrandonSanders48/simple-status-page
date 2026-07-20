import { NextResponse } from "next/server";
import { getIntegrationsStatus } from "@/lib/integrationsCache";

/** Public, cached (60s) marketplace integrations snapshot for the Integrations tab. */
export async function GET() {
  return NextResponse.json(await getIntegrationsStatus());
}
