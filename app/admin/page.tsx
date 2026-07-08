import { redirect } from "next/navigation";
import { requireAuth } from "@/lib/auth";
import AdminDashboard from "@/components/admin/AdminDashboard";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  if (!(await requireAuth())) {
    redirect("/");
  }
  return <AdminDashboard />;
}
