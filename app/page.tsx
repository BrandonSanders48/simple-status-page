import { cookies } from "next/headers";
import { db } from "@/lib/db/client";
import { settings } from "@/lib/db/schema";
import { computeUptimeHistory } from "@/lib/uptimeHistory";
import Dashboard from "@/components/Dashboard";

export const dynamic = "force-dynamic";

export default async function StatusPage({
  searchParams,
}: {
  searchParams: Promise<{ debug?: string }>;
}) {
  const cfg = db.select().from(settings).get();
  const { debug } = await searchParams;
  const cookieStore = await cookies();
  const initialDark = cookieStore.get("dark_mode")?.value === "on";
  // Computed directly (same process, no HTTP round trip) and baked into the initial
  // HTML rather than left to a client-side fetch -- a screenshot-based renderer (e.g.
  // digital signage widgets that snapshot the page rather than keep it live) can miss
  // client-fetched data entirely if it captures before that fetch resolves.
  const initialUptimeByService = computeUptimeHistory(30);

  return (
    <Dashboard
      businessName={cfg?.businessName ?? "Status Page"}
      logoPath={cfg?.businessLogoPath ?? null}
      refreshRateMs={cfg?.refreshRateMs ?? 12000}
      servicesVisibleCount={cfg?.servicesVisibleCount ?? 10}
      alertSound={cfg?.alertSound ?? false}
      browserNotify={cfg?.browserNotify ?? false}
      initialDark={initialDark}
      footerMessage={cfg?.footerMessage ?? ""}
      supportPhone={cfg?.supportPhone ?? null}
      configVersion={cfg?.configVersion ?? null}
      metaAuthor={cfg?.metaAuthor ?? null}
      debug={debug === "1"}
      initialUptimeByService={initialUptimeByService}
    />
  );
}
