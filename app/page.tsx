import { cookies } from "next/headers";
import { db } from "@/lib/db/client";
import { settings } from "@/lib/db/schema";
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
    />
  );
}
