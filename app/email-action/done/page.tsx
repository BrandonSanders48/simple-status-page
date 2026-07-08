import Link from "next/link";

function Card({ icon, title, children }: { icon: string; title: string; children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-100 dark:bg-slate-900 p-4">
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl max-w-md w-full p-10 text-center">
        <div className="text-5xl mb-3">{icon}</div>
        <h1 className="text-xl font-bold text-slate-900 dark:text-white mb-2">{title}</h1>
        {children}
      </div>
    </div>
  );
}

export default async function EmailActionDonePage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string; service?: string }>;
}) {
  const { type, service } = await searchParams;
  const isWip = type === "wip";
  const label = isWip ? "Work in Progress" : "Resolved";
  const icon = isWip ? "⚙️" : "✅";

  return (
    <Card icon={icon} title="Done">
      <p className="text-slate-500 dark:text-slate-400 text-sm mb-6">
        {label} incident posted for <b>{service}</b>. It is now visible on the status page.
      </p>
      <Link href="/" className="text-sm text-indigo-600 dark:text-indigo-400 hover:underline">
        ← Back to Status Page
      </Link>
    </Card>
  );
}
