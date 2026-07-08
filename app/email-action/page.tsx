import { getActionToken } from "@/lib/emailTokens";

export const dynamic = "force-dynamic";

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

export default async function EmailActionPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  const payload = token ? getActionToken(token) : null;

  if (!payload) {
    return (
      <Card icon="⏱" title="Link Expired">
        <p className="text-slate-500 dark:text-slate-400 text-sm">This action link has already been used or has expired.</p>
      </Card>
    );
  }

  const isWip = payload.action === "wip";
  const label = isWip ? "Work in Progress" : "Mark as Resolved";
  const icon = isWip ? "⚙️" : "✅";
  const btnCls = isWip ? "bg-amber-500 hover:bg-amber-400" : "bg-emerald-500 hover:bg-emerald-400";

  return (
    <Card icon={icon} title={label}>
      <p className="text-slate-500 dark:text-slate-400 text-sm mb-6">
        This will post a <b>{label}</b> incident for <b>{payload.serviceName}</b> on the status page.
      </p>
      <form method="POST" action="/api/email-action">
        <input type="hidden" name="token" value={token} />
        <button type="submit" className={`px-7 py-2.5 rounded-lg text-white font-semibold text-sm transition-colors ${btnCls}`}>
          {label}
        </button>
      </form>
    </Card>
  );
}
