"use client";

import { useState } from "react";
import type { SettingsRow } from "@/lib/adminTypes";
import { inputCls, labelCls } from "./styles";
import { SettingsGroup } from "./SettingsGroup";

export default function StorageTab({
  settings,
  onChange,
  csrfToken,
}: {
  settings: SettingsRow;
  onChange: (s: SettingsRow) => void;
  csrfToken: string;
}) {
  const [testing, setTesting] = useState<"powerstore" | "proxmox" | null>(null);
  const [testResult, setTestResult] = useState<{ target: string; ok: boolean; text: string } | null>(null);

  function set<K extends keyof SettingsRow>(key: K, value: SettingsRow[K]) {
    onChange({ ...settings, [key]: value });
  }

  async function testConnection(target: "powerstore" | "proxmox") {
    setTesting(target);
    setTestResult(null);
    const body =
      target === "powerstore"
        ? { target, host: settings.powerstoreHost, username: settings.powerstoreUsername, password: settings.powerstorePassword }
        : { target, host: settings.proxmoxHost, tokenId: settings.proxmoxTokenId, tokenSecret: settings.proxmoxTokenSecret, storageId: settings.proxmoxStorageId };

    try {
      const res = await fetch("/api/admin/test-storage", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-CSRF-Token": csrfToken },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Connection test failed.");
      setTestResult({ target, ok: true, text: data.summary || "Connected successfully." });
    } catch (err) {
      setTestResult({ target, ok: false, text: err instanceof Error ? err.message : "Connection test failed." });
    } finally {
      setTesting(null);
    }
  }

  return (
    <div>
      <SettingsGroup
        title="Storage Monitoring"
        description="Shows a dedicated panel on the public status page with PowerStore health/Metro replication status and how Proxmox sees that storage."
      >
        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={settings.storageIntegrationEnabled}
            onChange={(e) => set("storageIntegrationEnabled", e.target.checked)}
            className="w-4 h-4 accent-indigo-600"
          />
          <span className="text-sm font-medium">Show storage panel on the status page</span>
        </label>
      </SettingsGroup>

      <SettingsGroup title="Dell PowerStore" description="Management IP/hostname and a read-only account for the PowerStore REST API." wide>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label htmlFor="cfg-ps-host" className={labelCls}>Management Host</label>
            <input id="cfg-ps-host" className={inputCls} value={settings.powerstoreHost ?? ""} onChange={(e) => set("powerstoreHost", e.target.value)} placeholder="10.0.0.10" />
          </div>
          <div>
            <label htmlFor="cfg-ps-user" className={labelCls}>Username</label>
            <input id="cfg-ps-user" className={inputCls} value={settings.powerstoreUsername ?? ""} onChange={(e) => set("powerstoreUsername", e.target.value)} />
          </div>
          <div className="sm:col-span-2">
            <label htmlFor="cfg-ps-pass" className={labelCls}>Password</label>
            <input
              id="cfg-ps-pass"
              type="password"
              className={inputCls}
              value={settings.powerstorePassword ?? ""}
              onChange={(e) => set("powerstorePassword", e.target.value)}
              placeholder="********"
            />
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => testConnection("powerstore")}
            disabled={testing === "powerstore" || !settings.powerstoreHost}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg whitespace-nowrap disabled:opacity-60"
          >
            <i className="fa-solid fa-plug text-xs mr-1.5" /> {testing === "powerstore" ? "Testing..." : "Test Connection"}
          </button>
          {testResult?.target === "powerstore" && (
            <p className={`text-xs ${testResult.ok ? "text-emerald-600" : "text-red-500"}`}>{testResult.text}</p>
          )}
        </div>
      </SettingsGroup>

      <SettingsGroup title="Proxmox" description="Cluster API endpoint and an API token, used to check how Proxmox itself sees the PowerStore-backed storage." wide>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label htmlFor="cfg-pve-host" className={labelCls}>API Host</label>
            <input id="cfg-pve-host" className={inputCls} value={settings.proxmoxHost ?? ""} onChange={(e) => set("proxmoxHost", e.target.value)} placeholder="https://10.0.0.5:8006" />
          </div>
          <div>
            <label htmlFor="cfg-pve-storage" className={labelCls}>Storage ID</label>
            <input
              id="cfg-pve-storage"
              className={inputCls}
              value={settings.proxmoxStorageId ?? ""}
              onChange={(e) => set("proxmoxStorageId", e.target.value)}
              placeholder="powerstore-nfs"
            />
            <p className="text-xs text-slate-400 mt-1">The storage ID as configured in Proxmox. Leave blank to show every storage the token can see.</p>
          </div>
          <div>
            <label htmlFor="cfg-pve-token-id" className={labelCls}>API Token ID</label>
            <input id="cfg-pve-token-id" className={inputCls} value={settings.proxmoxTokenId ?? ""} onChange={(e) => set("proxmoxTokenId", e.target.value)} placeholder="statuspage@pve!monitor" />
          </div>
          <div>
            <label htmlFor="cfg-pve-token-secret" className={labelCls}>API Token Secret</label>
            <input
              id="cfg-pve-token-secret"
              type="password"
              className={inputCls}
              value={settings.proxmoxTokenSecret ?? ""}
              onChange={(e) => set("proxmoxTokenSecret", e.target.value)}
              placeholder="********"
            />
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => testConnection("proxmox")}
            disabled={testing === "proxmox" || !settings.proxmoxHost}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg whitespace-nowrap disabled:opacity-60"
          >
            <i className="fa-solid fa-plug text-xs mr-1.5" /> {testing === "proxmox" ? "Testing..." : "Test Connection"}
          </button>
          {testResult?.target === "proxmox" && (
            <p className={`text-xs ${testResult.ok ? "text-emerald-600" : "text-red-500"}`}>{testResult.text}</p>
          )}
        </div>
      </SettingsGroup>
    </div>
  );
}
