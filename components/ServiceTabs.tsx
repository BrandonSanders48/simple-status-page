"use client";

import { useState } from "react";
import ServicesPanel from "./ServicesPanel";
import { PowerstoreSection, ProxmoxSection, isPowerstoreHealthy, isProxmoxHealthy, type StoragePayload } from "./StorageSections";
import type { StatusServicePayload } from "@/lib/statusCache";

type TabKey = "services" | "storage" | "proxmox";

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
      className={`relative flex items-center gap-2 px-3.5 py-2 rounded-lg text-sm font-medium transition-colors ${
        active
          ? "bg-indigo-600 text-white"
          : "bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700/50"
      }`}
    >
      <i className={`fa-solid ${icon} text-xs`} /> {label}
      {hasIssue && (
        <span
          title="This tab has an active issue"
          className={`flex items-center justify-center w-4 h-4 rounded-full text-[10px] ${
            active ? "bg-white text-red-600" : "bg-red-500 text-white"
          }`}
        >
          <i className="fa-solid fa-exclamation" />
        </span>
      )}
    </button>
  );
}

/**
 * Tabs between the internally-hosted service tiles and, when configured, the
 * PowerStore and Proxmox storage panels. Falls back to plain (tab-less) Internal
 * Services when storage monitoring isn't enabled, so sites not using it see no change.
 */
export default function ServiceTabs({
  services,
  visibleCount,
  loading,
  onOpenOutageLog,
  storage,
  isAdmin,
  csrfToken,
  onStorageChanged,
  uptimeByService,
}: {
  services: StatusServicePayload[];
  visibleCount: number;
  loading: boolean;
  onOpenOutageLog: () => void;
  storage: StoragePayload | null;
  isAdmin: boolean;
  csrfToken?: string;
  onStorageChanged: () => void;
  uptimeByService?: Record<number, DayUptime[]>;
}) {
  const [tab, setTab] = useState<TabKey>("services");
  const [acknowledgingId, setAcknowledgingId] = useState<string | null>(null);

  const hasPowerstore = !!storage?.powerstore;
  const hasProxmox = !!storage?.proxmox;

  async function handleAcknowledge(alertId: string) {
    if (!csrfToken) return;
    setAcknowledgingId(alertId);
    try {
      await fetch("/api/admin/powerstore-alert", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-CSRF-Token": csrfToken },
        body: JSON.stringify({ alertId }),
      });
      onStorageChanged();
    } catch {
      // Swallow -- the alert simply stays in the list, and the user can retry.
    } finally {
      setAcknowledgingId(null);
    }
  }

  if (!hasPowerstore && !hasProxmox) {
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

  const activeTab = (tab === "storage" && !hasPowerstore) || (tab === "proxmox" && !hasProxmox) ? "services" : tab;

  const servicesHaveIssue = services.some((s) => !s.up);
  const powerstoreHasIssue = !!storage?.powerstore && !isPowerstoreHealthy(storage.powerstore);
  const proxmoxHasIssue = !!storage?.proxmox && !isProxmoxHealthy(storage.proxmox);

  return (
    <div className="mb-5">
      <div className="flex flex-wrap gap-2 mb-3">
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
      </div>

      {activeTab === "services" && (
        <ServicesPanel
          services={services}
          visibleCount={visibleCount}
          loading={loading}
          onOpenOutageLog={onOpenOutageLog}
          uptimeByService={uptimeByService}
        />
      )}
      {activeTab === "storage" && storage?.powerstore && (
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-sm p-5">
          <PowerstoreSection
            status={storage.powerstore}
            canAcknowledge={isAdmin}
            acknowledgingId={acknowledgingId}
            onAcknowledge={handleAcknowledge}
          />
        </div>
      )}
      {activeTab === "proxmox" && storage?.proxmox && (
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-sm p-5">
          <ProxmoxSection status={storage.proxmox} />
        </div>
      )}
    </div>
  );
}
