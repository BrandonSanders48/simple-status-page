import { cookies } from "next/headers";
import { db } from "@/lib/db/client";
import { settings } from "@/lib/db/schema";
import IntegrationsPage from "@/components/IntegrationsPage";

export const dynamic = "force-dynamic";

export default async function IntegrationsRoute() {
  const cfg = db.select().from(settings).get();
  const cookieStore = await cookies();
  const initialDark = cookieStore.get("dark_mode")?.value === "on";

  return (
    <IntegrationsPage
      businessName={cfg?.businessName ?? "Status Page"}
      logoPath={cfg?.businessLogoPath ?? null}
      refreshRateMs={cfg?.refreshRateMs ?? 12000}
      initialDark={initialDark}
      supportPhone={cfg?.supportPhone ?? null}
      configVersion={cfg?.configVersion ?? null}
    />
  );
}
