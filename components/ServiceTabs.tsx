"use client";

import { useState } from "react";
import ServicesPanel from "./ServicesPanel";
import { isPowerstoreHealthy, isProxmoxHealthy, type StoragePayload } from "./StorageSections";
import FailoverSection from "./FailoverSection";
import { computeFailoverStatus } from "@/lib/failover";
import type { StatusServicePayload } from "@/lib/statusCache";

type TabKey = "services" | "failover";

interface DayUptime {
  date: string;
  upPercent: number | null;
}

function TabButton({
  active,
  onClick,
  icon,
  label,
  hasIssue,
}: {
  active: boolean;
  onClick: () => void;
  icon: string;
  label: string;
  hasIssue: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`relative flex items-center gap-2 px-3.5 py-2.5 text-sm font-medium rounded-t-lg border border-b-0 transition-colors ${
        active
          ? "bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 border-b-white dark:border-b-slate-800 text-indigo-600 dark:text-indigo-400 -mb-px"
          : "border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100/70 dark:hover:bg-slate-700/40"
      }`}
    >
      <i className={`fa-solid ${icon} text-xs`} /> {label}
      {hasIssue && (
        <span
          title="This tab has an active issue"
          className="flex items-center justify-center w-4 h-4 rounded-full text-[10px] bg-red-500 text-white"
        >
          <i className="fa-solid fa-exclamation" />
        </span>
      )}
    </button>
  );
}

/**
 * Tabs between the internally-hosted service tiles and, when PowerStore/Proxmox are
 * configured, a Failover tab for the DR recommendation/actions. PowerStore/Proxmox/PBS/
 * marketplace integrations themselves live on their own /integrations page (see
 * components/IntegrationsPage.tsx), not here. Falls back to plain (tab-less) Internal
 * Services when Failover isn't available, so sites not using DR see no change.
 */
export default function ServiceTabs({
  services,
  visibleCount,
  loading,
  onOpenOutageLog,
  storage,
  isAdmin,
  csrfToken,
  uptimeByService,
}: {
  services: StatusServicePayload[];
  visibleCount: number;
  loading: boolean;
  onOpenOutageLog: () => void;
  storage: StoragePayload | null;
  isAdmin: boolean;
  csrfToken?: string;
  uptimeByService?: Record<number, DayUptime[]>;
}) {
  const [tab, setTab] = useState<TabKey>("services");

  const powerstores = storage?.powerstores ?? [];
  const proxmoxes = storage?.proxmoxes ?? [];
  const hasFailover = powerstores.length > 0 || proxmoxes.length > 0;

  if (!hasFailover) {
    return (
      <ServicesPanel
        services={services}
        visibleCount={visibleCount}
        loading={loading}
        onOpenOutageLog={onOpenOutageLog}
        uptimeByService={uptimeByService}
      />
    );
  }

  const activeTab = tab === "failover" && !hasFailover ? "services" : tab;

  const servicesHaveIssue = services.some((s) => !s.up);
  const powerstoreHasIssue = powerstores.some((t) => !isPowerstoreHealthy(t.status));
  const proxmoxHasIssue = proxmoxes.some((t) => !isProxmoxHealthy(t.status));
  const failoverRecommendation = computeFailoverStatus(storage, services).recommendation;
  const failoverHasIssue = powerstoreHasIssue || proxmoxHasIssue || failoverRecommendation === "recommend" || failoverRecommendation === "caution";

  return (
    <div className="mb-5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-sm">
      <div className="flex flex-wrap gap-1 px-3 pt-3 border-b border-slate-200 dark:border-slate-700">
        <TabButton
          active={activeTab === "services"}
          onClick={() => setTab("services")}
          icon="fa-server"
          label="Internal Services"
          hasIssue={servicesHaveIssue}
        />
        <TabButton
          active={activeTab === "failover"}
          onClick={() => setTab("failover")}
          icon="fa-tower-broadcast"
          label="Failover"
          hasIssue={failoverHasIssue}
        />
      </div>

      <div className="p-5">
        {activeTab === "services" && (
          <ServicesPanel
            services={services}
            visibleCount={visibleCount}
            loading={loading}
            onOpenOutageLog={onOpenOutageLog}
            uptimeByService={uptimeByService}
            bare
          />
        )}
        {activeTab === "failover" && <FailoverSection storage={storage} services={services} isAdmin={isAdmin} csrfToken={csrfToken} />}
      </div>
    </div>
  );
}
