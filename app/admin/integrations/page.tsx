import { redirect } from "next/navigation";
import { requireAuth } from "@/lib/auth";
import IntegrationsAdminPage from "@/components/admin/IntegrationsAdminPage";

export const dynamic = "force-dynamic";

export default async function AdminIntegrationsPage() {
  if (!(await requireAuth())) {
    redirect("/");
  }
  return <IntegrationsAdminPage />;
}
