"use client";

import { useState } from "react";
import ServicesPanel from "./ServicesPanel";
import {
  PowerstoreSection,
  ProxmoxSection,
  PbsSection,
  isPowerstoreHealthy,
  isProxmoxHealthy,
  isPbsHealthy,
  type StoragePayload,
  type PbsPayload,
} from "./StorageSections";
import FailoverSection from "./FailoverSection";
import { computeFailoverStatus } from "@/lib/failover";
import { IntegrationCard, isIntegrationHealthy, type IntegrationsPayload } from "./IntegrationsSection";
import TestNetworkModal from "./admin/TestNetworkModal";
import type { StatusServicePayload, SitePayload } from "@/lib/statusCache";

type TabKey = "services" | "integrations" | "failover";

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
 * Tabs between the internally-hosted service tiles and, when configured, everything
 * else: PowerStore, Proxmox, PBS, and marketplace integrations (UniFi, Sophos, GoTo
 * Connect, etc) all live together under one "Integrations" tab, plus a separate
 * Failover tab for the DR recommendation/actions. Falls back to plain (tab-less)
 * Internal Services when none of them are enabled, so sites not using them see no
 * change. Each target is shown as its own named card within the tab, so monitoring
 * both a main site and a DR site (say) is just two cards, not two tabs.
 */
export default function ServiceTabs({
  services,
  sites,
  groupBySite,
  visibleCount,
  loading,
  onOpenOutageLog,
  storage,
  pbs,
  integrations,
  isAdmin,
  csrfToken,
  onStorageChanged,
  onPbsChanged,
  onIntegrationsChanged,
  uptimeByService,
}: {
  services: StatusServicePayload[];
  sites: SitePayload[];
  groupBySite: boolean;
  visibleCount: number;
  loading: boolean;
  onOpenOutageLog: () => void;
  storage: StoragePayload | null;
  pbs: PbsPayload | null;
  integrations: IntegrationsPayload | null;
  isAdmin: boolean;
  csrfToken?: string;
  onStorageChanged: () => void;
  onPbsChanged: () => void;
  onIntegrationsChanged: () => void;
  uptimeByService?: Record<number, DayUptime[]>;
}) {
  const [tab, setTab] = useState<TabKey>("services");
  const [acknowledging, setAcknowledging] = useState<{ targetId: number; alertId: string } | null>(null);
  const [acknowledgingTask, setAcknowledgingTask] = useState<{ targetId: number; taskId: string } | null>(null);
  const [showTestNetwork, setShowTestNetwork] = useState(false);

  const testNetworkButton = (
    <button
      type="button"
      onClick={() => setShowTestNetwork(true)}
      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-500 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 bg-slate-100 dark:bg-slate-800/70 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg whitespace-nowrap"
    >
      <i className="fa-solid fa-network-wired text-xs" /> Test Network
    </button>
  );

  const powerstores = storage?.powerstores ?? [];
  const proxmoxes = storage?.proxmoxes ?? [];
  const pbsTargets = pbs?.targets ?? [];
  const integrationTargets = integrations?.targets ?? [];
  const hasPowerstore = powerstores.length > 0;
  const hasProxmox = proxmoxes.length > 0;
  const hasPbs = pbsTargets.length > 0;
  const hasMarketplace = integrationTargets.length > 0;
  const hasIntegrationsTab = hasPowerstore || hasProxmox || hasPbs || hasMarketplace;

  async function handleAcknowledge(targetId: number, alertId: string) {
    if (!csrfToken) return;
    setAcknowledging({ targetId, alertId });
    try {
      await fetch("/api/admin/powerstore-alert", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-CSRF-Token": csrfToken },
        body: JSON.stringify({ targetId, alertId }),
      });
      onStorageChanged();
    } catch {
      // Swallow - the alert simply stays in the list, and the user can retry.
    } finally {
      setAcknowledging(null);
    }
  }

  async function handleAcknowledgeTask(targetId: number, taskId: string) {
    if (!csrfToken) return;
    setAcknowledgingTask({ targetId, taskId });
    try {
      await fetch("/api/admin/pbs-task", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-CSRF-Token": csrfToken },
        body: JSON.stringify({ targetId, taskId }),
      });
      onPbsChanged();
    } catch {
      // Swallow - the task simply stays unclear, and the user can retry.
    } finally {
      setAcknowledgingTask(null);
    }
  }

  if (!hasIntegrationsTab) {
    return (
      <>
        <div className="flex justify-end mb-2">{testNetworkButton}</div>
        <ServicesPanel
          services={services}
          sites={sites}
          groupBySite={groupBySite}
          visibleCount={visibleCount}
          loading={loading}
          onOpenOutageLog={onOpenOutageLog}
          uptimeByService={uptimeByService}
        />
        {showTestNetwork && csrfToken && <TestNetworkModal csrfToken={csrfToken} onClose={() => setShowTestNetwork(false)} />}
      </>
    );
  }

  const hasFailover = hasPowerstore || hasProxmox;
  const activeTab =
    (tab === "integrations" && !hasIntegrationsTab) || (tab === "failover" && !hasFailover) ? "services" : tab;

  const servicesHaveIssue = services.some((s) => !s.up);
  const powerstoreHasIssue = powerstores.some((t) => !isPowerstoreHealthy(t.status));
  const proxmoxHasIssue = proxmoxes.some((t) => !isProxmoxHealthy(t.status));
  const pbsHasIssue = pbsTargets.some((t) => !isPbsHealthy(t.status));
  const marketplaceHasIssue = integrationTargets.some((t) => !isIntegrationHealthy(t.status));
  const integrationsTabHasIssue = powerstoreHasIssue || proxmoxHasIssue || pbsHasIssue || marketplaceHasIssue;
  const failoverRecommendation = computeFailoverStatus(storage, services).recommendation;
  const failoverHasIssue = failoverRecommendation === "recommend" || failoverRecommendation === "caution";

  return (
    <div className="mb-5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-sm">
      <div className="flex items-center justify-between gap-2 px-3 pt-3 border-b border-slate-200 dark:border-slate-700">
        <div className="flex flex-wrap gap-1">
          <TabButton
            active={activeTab === "services"}
            onClick={() => setTab("services")}
            icon="fa-server"
            label="Internal Services"
            hasIssue={servicesHaveIssue}
          />
          {hasIntegrationsTab && (
            <TabButton
              active={activeTab === "integrations"}
              onClick={() => setTab("integrations")}
              icon="fa-store"
              label="Integrations"
              hasIssue={integrationsTabHasIssue}
            />
          )}
          {hasFailover && (
            <TabButton
              active={activeTab === "failover"}
              onClick={() => setTab("failover")}
              icon="fa-tower-broadcast"
              label="Failover"
              hasIssue={failoverHasIssue}
            />
          )}
        </div>
        {testNetworkButton}
      </div>

      <div className="p-5">
        {activeTab === "services" && (
          <ServicesPanel
            services={services}
            sites={sites}
            groupBySite={groupBySite}
            visibleCount={visibleCount}
            loading={loading}
            onOpenOutageLog={onOpenOutageLog}
            uptimeByService={uptimeByService}
            bare
          />
        )}
        {activeTab === "integrations" && (
          <div className="space-y-4">
            {powerstores.map((t) => (
              <div key={`ps-${t.id}`} className="bg-slate-50 dark:bg-slate-900/40 border border-slate-200 dark:border-slate-700 rounded-xl p-5">
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
              <div key={`pve-${t.id}`} className="bg-slate-50 dark:bg-slate-900/40 border border-slate-200 dark:border-slate-700 rounded-xl p-5">
                <ProxmoxSection name={t.name} status={t.status} isDr={t.isDr} />
              </div>
            ))}
            {pbsTargets.map((t) => (
              <div key={`pbs-${t.id}`} className="bg-slate-50 dark:bg-slate-900/40 border border-slate-200 dark:border-slate-700 rounded-xl p-5">
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
              <div key={`int-${t.id}`} className="bg-slate-50 dark:bg-slate-900/40 border border-slate-200 dark:border-slate-700 rounded-xl p-5">
                <IntegrationCard
                  targetId={t.id}
                  integration={t.integration}
                  name={t.name}
                  status={t.status}
                  isAdmin={isAdmin}
                  csrfToken={csrfToken}
                  onIgnoreChanged={onIntegrationsChanged}
                />
              </div>
            ))}
          </div>
        )}
        {activeTab === "failover" && <FailoverSection storage={storage} services={services} isAdmin={isAdmin} csrfToken={csrfToken} />}
      </div>
      {showTestNetwork && csrfToken && <TestNetworkModal csrfToken={csrfToken} onClose={() => setShowTestNetwork(false)} />}
    </div>
  );
}
