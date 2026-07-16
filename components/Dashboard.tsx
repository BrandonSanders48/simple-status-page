"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import StatusBanner from "./StatusBanner";
import NetworkStatusRow from "./NetworkStatusRow";
import ServicesPanel from "./ServicesPanel";
import IncidentsPanel from "./IncidentsPanel";
import RssPanel from "./RssPanel";
import StoragePanel from "./StoragePanel";
import OutageHistoryModal from "./OutageHistoryModal";
import DarkModeToggle from "./DarkModeToggle";
import LoginModal from "./LoginModal";
import CreateIncidentModal from "./CreateIncidentModal";
import SubscribeModal from "./SubscribeModal";
import ManageSubscriptionsModal from "./ManageSubscriptionsModal";
import Footer from "./Footer";
import SlaBadge from "./SlaBadge";
import DebugOverlay from "./DebugOverlay";
import { useSession } from "@/lib/useSession";
import type { StatusPayload } from "@/lib/statusCache";
import type { RssCardPayload } from "@/lib/rssCache";

interface Incident {
  id: number;
  title: string;
  description: string | null;
  severity: "degraded" | "outage" | "maintenance" | "resolved";
  startTime: string;
  endTime: string | null;
}

export default function Dashboard({
  businessName,
  logoPath = null,
  refreshRateMs,
  servicesVisibleCount,
  alertSound = false,
  browserNotify = false,
  initialDark = false,
  footerMessage = "",
  supportPhone = null,
  configVersion = null,
  metaAuthor = null,
  debug = false,
}: {
  businessName: string;
  logoPath?: string | null;
  refreshRateMs: number;
  servicesVisibleCount: number;
  alertSound?: boolean;
  browserNotify?: boolean;
  initialDark?: boolean;
  footerMessage?: string;
  supportPhone?: string | null;
  configVersion?: string | null;
  metaAuthor?: string | null;
  debug?: boolean;
}) {
  const { session, login, logout } = useSession();
  const [status, setStatus] = useState<StatusPayload | null>(null);
  const lastServiceStates = useRef<Map<number, boolean>>(new Map());
  const [rss, setRss] = useState<RssCardPayload[]>([]);
  const [rssLoaded, setRssLoaded] = useState(false);
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [showOutageLog, setShowOutageLog] = useState(false);
  const [showLogin, setShowLogin] = useState(false);
  const [showCreateIncident, setShowCreateIncident] = useState(false);
  const [showSubscribe, setShowSubscribe] = useState(false);
  const [showManageSubs, setShowManageSubs] = useState(false);

  const loadStatus = useCallback(() => {
    fetch("/api/status")
      .then((r) => r.json())
      .then((data: StatusPayload) => {
        for (const svc of data.services) {
          const prev = lastServiceStates.current.get(svc.id);
          if (prev !== undefined && prev !== svc.up) {
            if (alertSound) {
              new Audio("/alert.wav").play().catch(() => {});
            }
            if (browserNotify && typeof Notification !== "undefined" && Notification.permission === "granted") {
              new Notification(svc.up ? `${svc.name} is UP` : `${svc.name} is DOWN`, {
                body: svc.up ? `${svc.name} has recovered.` : `${svc.name} is currently down.`,
              });
            }
          }
          lastServiceStates.current.set(svc.id, svc.up);
        }
        setStatus(data);
      })
      .catch(() => {});
  }, [alertSound, browserNotify]);

  const loadRss = useCallback(() => {
    fetch("/api/rss")
      .then((r) => r.json())
      .then((data) => {
        setRss(data);
        setRssLoaded(true);
      })
      .catch(() => {});
  }, []);

  const loadIncidents = useCallback(() => {
    fetch("/api/incidents")
      .then((r) => r.json())
      .then(setIncidents)
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (browserNotify && typeof Notification !== "undefined" && Notification.permission === "default") {
      Notification.requestPermission();
    }
  }, [browserNotify]);

  useEffect(() => {
    loadStatus();
    loadRss();
    loadIncidents();
    const statusTimer = setInterval(loadStatus, refreshRateMs);
    const rssTimer = setInterval(loadRss, refreshRateMs);
    const incidentsTimer = setInterval(loadIncidents, refreshRateMs);
    return () => {
      clearInterval(statusTimer);
      clearInterval(rssTimer);
      clearInterval(incidentsTimer);
    };
  }, [loadStatus, loadRss, loadIncidents, refreshRateMs]);

  async function handleRemoveIncident(id: number) {
    if (!session) return;
    await fetch(`/api/incidents/${id}`, { method: "DELETE", headers: { "X-CSRF-Token": session.csrfToken } });
    loadIncidents();
  }

  const overallOk = status ? status.services.every((s) => s.up) && status.local.ok !== false && status.wide.ok !== false : null;
  const isAdmin = !!session?.authenticated;

  return (
    <div className="min-h-screen">
      <nav className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800/60">
        <div className="max-w-screen-xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            {logoPath && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logoPath} alt={businessName} className="h-8 w-auto rounded bg-white p-0.5 object-contain" />
            )}
            <div className="flex flex-col gap-0.5">
              <span className="font-semibold text-slate-900 dark:text-white leading-none">{businessName}</span>
              <SlaBadge />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <DarkModeToggle initialDark={initialDark} />
            {isAdmin ? (
              <>
                <Link
                  href="/admin"
                  className="flex items-center justify-center h-8 w-8 bg-slate-100 dark:bg-slate-800/70 hover:bg-slate-200 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700/60 rounded-lg text-slate-500 dark:text-slate-400"
                  title="Edit Configuration"
                >
                  <i className="fa-solid fa-wrench text-xs" />
                </Link>
                <button
                  type="button"
                  onClick={() => logout()}
                  className="flex items-center gap-1.5 h-8 px-3 bg-slate-100 dark:bg-slate-800/70 hover:bg-red-50 dark:hover:bg-red-900/30 border border-slate-200 dark:border-slate-700/60 rounded-lg text-slate-500 dark:text-slate-400 hover:text-red-600 text-xs font-medium"
                >
                  <i className="fa-solid fa-right-from-bracket text-xs" /> Logout
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => setShowLogin(true)}
                className="flex items-center gap-1.5 h-8 px-3 bg-indigo-600 hover:bg-indigo-500 rounded-lg text-white text-xs font-medium"
              >
                <i className="fa-solid fa-right-to-bracket text-xs" /> Login
              </button>
            )}
          </div>
        </div>
      </nav>

      <main className="max-w-screen-xl mx-auto px-4 py-6">
        <StatusBanner loading={!status} ok={overallOk} live={!!status} />
        <div className="h-5 mb-4" />

        <IncidentsPanel incidents={incidents} isAdmin={isAdmin} onRemove={handleRemoveIncident} />

        <NetworkStatusRow local={status?.local ?? null} wide={status?.wide ?? null} />

        <StoragePanel />

        <ServicesPanel
          services={status?.services ?? []}
          visibleCount={servicesVisibleCount}
          loading={!status}
          onOpenOutageLog={() => setShowOutageLog(true)}
        />

        <RssPanel feeds={rss} loading={!rssLoaded} />
      </main>

      <Footer footerMessage={footerMessage} supportPhone={supportPhone} configVersion={configVersion} metaAuthor={metaAuthor} />

      <div className="fixed bottom-5 right-5 z-30 flex flex-col gap-2.5 w-44">
        {isAdmin && (
          <button
            type="button"
            onClick={() => setShowCreateIncident(true)}
            className="w-full flex items-center justify-center gap-2 py-2.5 bg-amber-500 hover:bg-amber-400 shadow-lg rounded-xl text-white text-sm font-medium"
          >
            <i className="fa-solid fa-triangle-exclamation" /> Incidents
          </button>
        )}
        <button
          type="button"
          onClick={() => setShowSubscribe(true)}
          className="w-full flex items-center justify-center gap-2 py-2.5 bg-emerald-600 hover:bg-emerald-500 shadow-lg rounded-xl text-white text-sm font-medium"
        >
          <i className="fa-solid fa-bell" /> Subscribe
        </button>
      </div>

      {showOutageLog && <OutageHistoryModal onClose={() => setShowOutageLog(false)} />}
      {showLogin && (
        <LoginModal
          onClose={() => setShowLogin(false)}
          onLogin={async (u, p) => {
            await login(u, p);
          }}
        />
      )}
      {showCreateIncident && session && (
        <CreateIncidentModal
          csrfToken={session.csrfToken}
          onClose={() => setShowCreateIncident(false)}
          onCreated={loadIncidents}
        />
      )}
      {showSubscribe && session && (
        <SubscribeModal
          services={status?.services ?? []}
          csrfToken={session.csrfToken}
          onClose={() => setShowSubscribe(false)}
          onManage={() => {
            setShowSubscribe(false);
            setShowManageSubs(true);
          }}
        />
      )}
      {showManageSubs && session && (
        <ManageSubscriptionsModal
          csrfToken={session.csrfToken}
          onClose={() => setShowManageSubs(false)}
          onBack={() => {
            setShowManageSubs(false);
            setShowSubscribe(true);
          }}
        />
      )}
      {debug && <DebugOverlay />}
    </div>
  );
}
