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
import type { StatusServicePayload } from "@/lib/statusCache";

type TabKey = "services" | "storage" | "proxmox" | "backups" | "failover";

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
 * Tabs between the internally-hosted service tiles and, when configured, the
 * PowerStore, Proxmox, and PBS panels. Falls back to plain (tab-less) Internal
 * Services when none of them are enabled, so sites not using them see no change.
 * Each target is shown as its own named card, so monitoring both a main site and a
 * DR site (say) is just two cards in one tab.
 */
export default function ServiceTabs({
  services,
  visibleCount,
  loading,
  onOpenOutageLog,
  storage,
  pbs,
  isAdmin,
  csrfToken,
  onStorageChanged,
  onPbsChanged,
  uptimeByService,
}: {
  services: StatusServicePayload[];
  visibleCount: number;
  loading: boolean;
  onOpenOutageLog: () => void;
  storage: StoragePayload | null;
  pbs: PbsPayload | null;
  isAdmin: boolean;
  csrfToken?: string;
  onStorageChanged: () => void;
  onPbsChanged: () => void;
  uptimeByService?: Record<number, DayUptime[]>;
}) {
  const [tab, setTab] = useState<TabKey>("services");
  const [acknowledging, setAcknowledging] = useState<{ targetId: number; alertId: string } | null>(null);
  const [acknowledgingTask, setAcknowledgingTask] = useState<{ targetId: number; taskId: string } | null>(null);

  const powerstores = storage?.powerstores ?? [];
  const proxmoxes = storage?.proxmoxes ?? [];
  const pbsTargets = pbs?.targets ?? [];
  const hasPowerstore = powerstores.length > 0;
  const hasProxmox = proxmoxes.length > 0;
  const hasPbs = pbsTargets.length > 0;

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
      // Swallow -- the alert simply stays in the list, and the user can retry.
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
      // Swallow -- the task simply stays unclear, and the user can retry.
    } finally {
      setAcknowledgingTask(null);
    }
  }

  if (!hasPowerstore && !hasProxmox && !hasPbs) {
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

  const hasFailover = hasPowerstore || hasProxmox;
  const activeTab =
    (tab === "storage" && !hasPowerstore) ||
    (tab === "proxmox" && !hasProxmox) ||
    (tab === "backups" && !hasPbs) ||
    (tab === "failover" && !hasFailover)
      ? "services"
      : tab;

  const servicesHaveIssue = services.some((s) => !s.up);
  const powerstoreHasIssue = powerstores.some((t) => !isPowerstoreHealthy(t.status));
  const proxmoxHasIssue = proxmoxes.some((t) => !isProxmoxHealthy(t.status));
  const pbsHasIssue = pbsTargets.some((t) => !isPbsHealthy(t.status));
  const failoverRecommendation = computeFailoverStatus(storage).recommendation;
  const failoverHasIssue = failoverRecommendation === "recommend" || failoverRecommendation === "caution";

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
        {hasPowerstore && (
          <TabButton
            active={activeTab === "storage"}
            onClick={() => setTab("storage")}
            icon="fa-database"
            label="Storage"
            hasIssue={powerstoreHasIssue}
          />
        )}
        {hasProxmox && (
          <TabButton
            active={activeTab === "proxmox"}
            onClick={() => setTab("proxmox")}
            icon="fa-cubes"
            label="Proxmox"
            hasIssue={proxmoxHasIssue}
          />
        )}
        {hasPbs && (
          <TabButton
            active={activeTab === "backups"}
            onClick={() => setTab("backups")}
            icon="fa-box-archive"
            label="Backups"
            hasIssue={pbsHasIssue}
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
        {activeTab === "storage" && (
          <div className="space-y-4">
            {powerstores.map((t) => (
              <div key={t.id} className="bg-slate-50 dark:bg-slate-900/40 border border-slate-200 dark:border-slate-700 rounded-xl p-5">
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
          </div>
        )}
        {activeTab === "proxmox" && (
          <div className="space-y-4">
            {proxmoxes.map((t) => (
              <div key={t.id} className="bg-slate-50 dark:bg-slate-900/40 border border-slate-200 dark:border-slate-700 rounded-xl p-5">
                <ProxmoxSection name={t.name} status={t.status} isDr={t.isDr} />
              </div>
            ))}
          </div>
        )}
        {activeTab === "backups" && (
          <div className="space-y-4">
            {pbsTargets.map((t) => (
              <div key={t.id} className="bg-slate-50 dark:bg-slate-900/40 border border-slate-200 dark:border-slate-700 rounded-xl p-5">
                <PbsSection
                  name={t.name}
                  status={t.status}
                  canAcknowledge={isAdmin}
                  acknowledgingId={acknowledgingTask?.targetId === t.id ? acknowledgingTask.taskId : null}
                  onAcknowledge={(taskId) => handleAcknowledgeTask(t.id, taskId)}
                />
              </div>
            ))}
          </div>
        )}
        {activeTab === "failover" && <FailoverSection storage={storage} isAdmin={isAdmin} csrfToken={csrfToken} />}
      </div>
    </div>
  );
}
