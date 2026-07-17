"use client";

import { useRef, useState } from "react";
import type { SettingsRow } from "@/lib/adminTypes";
import { inputCls, labelCls } from "./styles";
import { SettingsGroup } from "./SettingsGroup";

export default function GeneralTab({
  settings,
  onChange,
  csrfToken,
}: {
  settings: SettingsRow;
  onChange: (s: SettingsRow) => void;
  csrfToken: string;
}) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [uploadStatus, setUploadStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const [clearCacheStatus, setClearCacheStatus] = useState("");

  function set<K extends keyof SettingsRow>(key: K, value: SettingsRow[K]) {
    onChange({ ...settings, [key]: value });
  }

  async function handleLogoUpload(file: File) {
    setUploadStatus(null);
    const formData = new FormData();
    formData.append("file", file);
    const res = await fetch("/api/admin/upload/logo", {
      method: "POST",
      headers: { "X-CSRF-Token": csrfToken },
      body: formData,
    });
    const data = await res.json();
    if (!res.ok) {
      setUploadStatus({ ok: false, text: data.error || "Upload failed." });
      return;
    }
    set("businessLogoPath", data.path);
    setUploadStatus({ ok: true, text: "Logo uploaded." });
  }

  async function clearCache() {
    setClearCacheStatus("Clearing...");
    const res = await fetch("/api/admin/clear-cache", {
      method: "POST",
      headers: { "X-CSRF-Token": csrfToken },
    });
    setClearCacheStatus(res.ok ? "Cache cleared." : "Failed to clear cache.");
    setTimeout(() => setClearCacheStatus(""), 3000);
  }

  return (
    <div>
      <SettingsGroup title="Branding" description="Public-facing name, logo, and contact details shown on the status page and in emails.">
        <div>
          <label htmlFor="cfg-business-name" className={labelCls}>Business / Site Name</label>
          <input id="cfg-business-name" className={inputCls} value={settings.businessName} onChange={(e) => set("businessName", e.target.value)} />
        </div>
        <div>
          <span className={labelCls}>Logo</span>
          <div className="flex gap-2 items-center">
            {settings.businessLogoPath && (
              <img src={settings.businessLogoPath} alt="Logo preview" className="h-8 rounded bg-white p-1 border border-slate-200" />
            )}
            <button
              type="button"
              onClick={() => fileInput.current?.click()}
              className="flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-500/20 dark:hover:bg-indigo-500/30 text-indigo-600 dark:text-indigo-300 text-xs font-semibold rounded-lg border border-indigo-200 dark:border-indigo-400/40"
            >
              <i className="fa-solid fa-upload text-[11px]" /> Upload
            </button>
            <input
              ref={fileInput}
              type="file"
              aria-label="Upload logo"
              accept="image/jpeg,image/png,image/gif,image/webp,image/svg+xml"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && handleLogoUpload(e.target.files[0])}
            />
          </div>
          {uploadStatus && (
            <p className={`text-xs mt-1 ${uploadStatus.ok ? "text-emerald-600" : "text-red-500"}`}>{uploadStatus.text}</p>
          )}
        </div>
        <div>
          <label htmlFor="cfg-company-url" className={labelCls}>Company URL</label>
          <input
            id="cfg-company-url"
            type="url"
            className={inputCls}
            value={settings.companyUrl ?? ""}
            onChange={(e) => set("companyUrl", e.target.value)}
            placeholder="https://example.com"
          />
        </div>
        <div>
          <label htmlFor="cfg-support-email" className={labelCls}>Support Email</label>
          <input
            id="cfg-support-email"
            type="email"
            className={inputCls}
            value={settings.supportEmail ?? ""}
            onChange={(e) => set("supportEmail", e.target.value)}
            placeholder="support@example.com"
          />
        </div>
        <div>
          <label htmlFor="cfg-support-phone" className={labelCls}>Support Phone</label>
          <input id="cfg-support-phone" className={inputCls} value={settings.supportPhone ?? ""} onChange={(e) => set("supportPhone", e.target.value)} />
        </div>
        <div>
          <label htmlFor="cfg-footer-message" className={labelCls}>Footer Message</label>
          <input id="cfg-footer-message" className={inputCls} value={settings.footerMessage ?? ""} onChange={(e) => set("footerMessage", e.target.value)} />
        </div>
      </SettingsGroup>

      <SettingsGroup title="SLA Tracking" description="Show a real uptime badge in the navbar, computed from outage history.">
        <label className="flex items-center gap-3 cursor-pointer">
          <input type="checkbox" checked={settings.slaEnabled} onChange={(e) => set("slaEnabled", e.target.checked)} className="w-4 h-4 accent-indigo-600" />
          <span className="text-sm font-medium">Enable SLA reporting</span>
        </label>
        <div>
          <label htmlFor="cfg-sla-target" className={labelCls}>Uptime Target (%)</label>
          <input
            id="cfg-sla-target"
            type="number"
            min={0}
            max={100}
            step={0.01}
            className={inputCls}
            value={settings.slaUptimeTarget}
            onChange={(e) => set("slaUptimeTarget", Number(e.target.value))}
          />
          <p className="text-xs text-slate-400 mt-1">Compared against real uptime computed from outage history for the reporting period below.</p>
        </div>
        <div>
          <label htmlFor="cfg-sla-period" className={labelCls}>Reporting Period</label>
          <select
            id="cfg-sla-period"
            className={inputCls}
            value={settings.slaReportingPeriod}
            onChange={(e) => set("slaReportingPeriod", e.target.value as SettingsRow["slaReportingPeriod"])}
          >
            <option value="weekly">Weekly</option>
            <option value="monthly">Monthly</option>
            <option value="quarterly">Quarterly</option>
          </select>
        </div>
      </SettingsGroup>

      <SettingsGroup title="About / Meta" description="Shown in the footer, plus a read-only version counter that increments on every save.">
        <div>
          <label htmlFor="cfg-meta-description" className={labelCls}>Description</label>
          <input id="cfg-meta-description" className={inputCls} value={settings.metaDescription ?? ""} onChange={(e) => set("metaDescription", e.target.value)} />
        </div>
        <div>
          <label htmlFor="cfg-meta-author" className={labelCls}>Author</label>
          <input id="cfg-meta-author" className={inputCls} value={settings.metaAuthor ?? ""} onChange={(e) => set("metaAuthor", e.target.value)} />
        </div>
        <div>
          <label htmlFor="cfg-version" className={labelCls}>Config Version (auto-increments on save)</label>
          <input id="cfg-version" className={`${inputCls} bg-slate-50 dark:bg-slate-800 text-slate-400`} value={settings.configVersion} readOnly />
        </div>
      </SettingsGroup>

      <SettingsGroup title="Behaviour" description="Controls polling frequency, admin login requirement, and cached status data.">
        <div>
          <label htmlFor="cfg-refresh-rate" className={labelCls}>Auto-Refresh Interval (ms)</label>
          <input
            id="cfg-refresh-rate"
            type="number"
            min={3000}
            step={500}
            className={inputCls}
            value={settings.refreshRateMs}
            onChange={(e) => set("refreshRateMs", Number(e.target.value))}
          />
          <p className="text-xs text-slate-400 mt-1">Minimum 3000ms.</p>
        </div>
        <label className="flex items-center gap-3 cursor-pointer">
          <input type="checkbox" checked={settings.requireAuth} onChange={(e) => set("requireAuth", e.target.checked)} className="w-4 h-4 accent-indigo-600" />
          <span className="text-sm font-medium">
            Require login for admin features
            <span className="block text-xs text-slate-400 font-normal">Uncheck to allow config access without logging in</span>
          </span>
        </label>
        <div>
          <span className={labelCls}>Status Cache</span>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={clearCache}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-slate-600 dark:text-slate-300 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg border border-slate-200 dark:border-slate-700"
            >
              <i className="fa-solid fa-rotate text-xs" /> Clear Cache
            </button>
            {clearCacheStatus && <span className="text-xs text-slate-400">{clearCacheStatus}</span>}
          </div>
        </div>
      </SettingsGroup>
    </div>
  );
}
