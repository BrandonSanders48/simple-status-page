"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import TopNav from "./TopNav";
import LoginModal from "./LoginModal";
import Footer from "./Footer";
import { PowerstoreSection, ProxmoxSection, PbsSection, type StoragePayload, type PbsPayload } from "./StorageSections";
import { IntegrationCard, type IntegrationsPayload } from "./IntegrationsSection";
import { useSession } from "@/lib/useSession";

/**
 * Standalone page for PowerStore/Proxmox/PBS and marketplace integrations (UniFi,
 * Sophos, GoTo Connect, etc) -- split out of the main status page's "Integrations" tab
 * so it can grow (more targets, more marketplace entries) without crowding the primary
 * status view. Each target is its own card, same as the tab it replaced.
 */
export default function IntegrationsPage({
  businessName,
  logoPath = null,
  refreshRateMs,
  initialDark = false,
  supportPhone = null,
  configVersion = null,
}: {
  businessName: string;
  logoPath?: string | null;
  refreshRateMs: number;
  initialDark?: boolean;
  supportPhone?: string | null;
  configVersion?: string | null;
}) {
  const { session, login, logout } = useSession();
  const [storage, setStorage] = useState<StoragePayload | null>(null);
  const [pbs, setPbs] = useState<PbsPayload | null>(null);
  const [integrations, setIntegrations] = useState<IntegrationsPayload | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [showLogin, setShowLogin] = useState(false);
  const [acknowledging, setAcknowledging] = useState<{ targetId: number; alertId: string } | null>(null);
  const [acknowledgingTask, setAcknowledgingTask] = useState<{ targetId: number; taskId: string } | null>(null);

  const isAdmin = !!session?.authenticated;

  const loadStorage = useCallback(() => {
    fetch("/api/storage")
      .then((r) => r.json())
      .then(setStorage)
      .catch(() => {});
  }, []);

  const loadPbs = useCallback(() => {
    fetch("/api/pbs")
      .then((r) => r.json())
      .then(setPbs)
      .catch(() => {});
  }, []);

  const loadIntegrations = useCallback(() => {
    fetch("/api/integrations")
      .then((r) => r.json())
      .then(setIntegrations)
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, []);

  useEffect(() => {
    loadStorage();
    loadPbs();
    loadIntegrations();
    const storageTimer = setInterval(loadStorage, 60_000);
    const pbsTimer = setInterval(loadPbs, 60_000);
    const integrationsTimer = setInterval(loadIntegrations, 60_000);
    return () => {
      clearInterval(storageTimer);
      clearInterval(pbsTimer);
      clearInterval(integrationsTimer);
    };
  }, [loadStorage, loadPbs, loadIntegrations]);

  async function handleAcknowledge(targetId: number, alertId: string) {
    if (!session) return;
    setAcknowledging({ targetId, alertId });
    try {
      await fetch("/api/admin/powerstore-alert", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-CSRF-Token": session.csrfToken },
        body: JSON.stringify({ targetId, alertId }),
      });
      loadStorage();
    } catch {
      // Swallow -- the alert simply stays in the list, and the user can retry.
    } finally {
      setAcknowledging(null);
    }
  }

  async function handleAcknowledgeTask(targetId: number, taskId: string) {
    if (!session) return;
    setAcknowledgingTask({ targetId, taskId });
    try {
      await fetch("/api/admin/pbs-task", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-CSRF-Token": session.csrfToken },
        body: JSON.stringify({ targetId, taskId }),
      });
      loadPbs();
    } catch {
      // Swallow -- the task simply stays unacknowledged, and the user can retry.
    } finally {
      setAcknowledgingTask(null);
    }
  }

  const powerstores = storage?.powerstores ?? [];
  const proxmoxes = storage?.proxmoxes ?? [];
  const pbsTargets = pbs?.targets ?? [];
  const integrationTargets = integrations?.targets ?? [];
  const hasAny = powerstores.length > 0 || proxmoxes.length > 0 || pbsTargets.length > 0 || integrationTargets.length > 0;

  return (
    <div className="min-h-screen">
      <TopNav
        businessName={businessName}
        logoPath={logoPath}
        refreshRateMs={refreshRateMs}
        initialDark={initialDark}
        isAdmin={isAdmin}
        onLoginClick={() => setShowLogin(true)}
        onLogout={() => logout()}
        rightExtra={
          <Link
            href="/"
            className="flex items-center gap-1.5 h-8 px-3 bg-slate-100 dark:bg-slate-800/70 hover:bg-slate-200 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700/60 rounded-lg text-slate-500 dark:text-slate-400 text-xs font-medium"
          >
            <i className="fa-solid fa-arrow-left text-xs" /> Status Page
          </Link>
        }
      />

      <main className="max-w-screen-xl mx-auto px-4 py-6">
        <h1 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">Integrations</h1>

        {!loaded ? (
          <p className="text-sm text-slate-500 dark:text-slate-400">Loading...</p>
        ) : !hasAny ? (
          <p className="text-sm text-slate-500 dark:text-slate-400">No integrations configured yet.</p>
        ) : (
          <div className="space-y-4">
            {powerstores.map((t) => (
              <div key={`ps-${t.id}`} className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-5 shadow-sm">
                <PowerstoreSection
                  name={t.name}
                  status={t.status}
                  isDr={t.isDr}
                  canAcknowledge={isAdmin}
                  acknowledgingId={acknowledging?.targetId === t.id ? acknowledging.alertId : null}
                  onAcknowledge={(alertId) => handleAcknowledge(t.id, alertId)}
                />
              </div>
            ))}
            {proxmoxes.map((t) => (
              <div key={`pve-${t.id}`} className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-5 shadow-sm">
                <ProxmoxSection name={t.name} status={t.status} isDr={t.isDr} />
              </div>
            ))}
            {pbsTargets.map((t) => (
              <div key={`pbs-${t.id}`} className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-5 shadow-sm">
                <PbsSection
                  name={t.name}
                  status={t.status}
                  canAcknowledge={isAdmin}
                  acknowledgingId={acknowledgingTask?.targetId === t.id ? acknowledgingTask.taskId : null}
                  onAcknowledge={(taskId) => handleAcknowledgeTask(t.id, taskId)}
                />
              </div>
            ))}
            {integrationTargets.map((t) => (
              <div key={`int-${t.id}`} className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-5 shadow-sm">
                <IntegrationCard integration={t.integration} name={t.name} status={t.status} />
              </div>
            ))}
          </div>
        )}
      </main>

      <Footer supportPhone={supportPhone} configVersion={configVersion} />

      {showLogin && (
        <LoginModal
          onClose={() => setShowLogin(false)}
          onLogin={async (u, p) => {
            await login(u, p);
          }}
        />
      )}
    </div>
  );
}
