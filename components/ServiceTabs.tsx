"use client";

import { useState } from "react";
import ServicesPanel from "./ServicesPanel";
import { PowerstoreSection, ProxmoxSection, type StoragePayload } from "./StorageSections";
import type { StatusServicePayload } from "@/lib/statusCache";

type TabKey = "services" | "storage" | "proxmox";

function TabButton({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: string; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-sm font-medium transition-colors ${
        active
          ? "bg-indigo-600 text-white"
          : "bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700/50"
      }`}
    >
      <i className={`fa-solid ${icon} text-xs`} /> {label}
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
}: {
  services: StatusServicePayload[];
  visibleCount: number;
  loading: boolean;
  onOpenOutageLog: () => void;
  storage: StoragePayload | null;
}) {
  const [tab, setTab] = useState<TabKey>("services");

  const hasPowerstore = !!storage?.powerstore;
  const hasProxmox = !!storage?.proxmox;

  if (!hasPowerstore && !hasProxmox) {
    return <ServicesPanel services={services} visibleCount={visibleCount} loading={loading} onOpenOutageLog={onOpenOutageLog} />;
  }

  const activeTab = (tab === "storage" && !hasPowerstore) || (tab === "proxmox" && !hasProxmox) ? "services" : tab;

  return (
    <div className="mb-5">
      <div className="flex flex-wrap gap-2 mb-3">
        <TabButton active={activeTab === "services"} onClick={() => setTab("services")} icon="fa-server" label="Internal Services" />
        {hasPowerstore && <TabButton active={activeTab === "storage"} onClick={() => setTab("storage")} icon="fa-database" label="Storage" />}
        {hasProxmox && <TabButton active={activeTab === "proxmox"} onClick={() => setTab("proxmox")} icon="fa-cubes" label="Proxmox" />}
      </div>

      {activeTab === "services" && (
        <ServicesPanel services={services} visibleCount={visibleCount} loading={loading} onOpenOutageLog={onOpenOutageLog} />
      )}
      {activeTab === "storage" && storage?.powerstore && (
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-sm p-5">
          <PowerstoreSection status={storage.powerstore} />
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
