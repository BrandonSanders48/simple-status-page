"use client";

import { useState } from "react";
import type { SettingsRow } from "@/lib/adminTypes";
import { inputCls, labelCls } from "./styles";
import { SettingsGroup } from "./SettingsGroup";

export default function NotificationsTab({
  settings,
  onChange,
  csrfToken,
}: {
  settings: SettingsRow;
  onChange: (s: SettingsRow) => void;
  csrfToken: string;
}) {
  const [testTo, setTestTo] = useState("");
  const [testStatus, setTestStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const [sending, setSending] = useState(false);

  function set<K extends keyof SettingsRow>(key: K, value: SettingsRow[K]) {
    onChange({ ...settings, [key]: value });
  }

  async function sendTest() {
    if (!testTo) return;
    setSending(true);
    setTestStatus(null);
    try {
      const res = await fetch("/api/admin/test-email", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-CSRF-Token": csrfToken },
        body: JSON.stringify({ to: testTo }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to send test email.");
      setTestStatus({ ok: true, text: "Test email sent!" });
    } catch (err) {
      setTestStatus({ ok: false, text: err instanceof Error ? err.message : "Failed to send test email." });
    } finally {
      setSending(false);
    }
  }

  return (
    <div>
      <SettingsGroup title="Display & Behaviour" description="Client-side alerts and the announcement banner shown on the public page.">
        <label className="flex items-center gap-3 cursor-pointer">
          <input type="checkbox" checked={settings.alertSound} onChange={(e) => set("alertSound", e.target.checked)} className="w-4 h-4 accent-indigo-600" />
          <span className="text-sm font-medium">Play alert sound on status change</span>
        </label>
        <label className="flex items-center gap-3 cursor-pointer">
          <input type="checkbox" checked={settings.browserNotify} onChange={(e) => set("browserNotify", e.target.checked)} className="w-4 h-4 accent-indigo-600" />
          <span className="text-sm font-medium">Enable browser notifications</span>
        </label>
        <div>
          <label htmlFor="cfg-announcement-banner" className={labelCls}>Announcement Banner Text</label>
          <input
            id="cfg-announcement-banner"
            className={inputCls}
            value={settings.announcementBanner ?? ""}
            onChange={(e) => set("announcementBanner", e.target.value)}
            placeholder="Leave blank to hide banner"
          />
        </div>
        <div>
          <label htmlFor="cfg-announcement-type" className={labelCls}>Banner Type</label>
          <select
            id="cfg-announcement-type"
            className={inputCls}
            value={settings.announcementType}
            onChange={(e) => set("announcementType", e.target.value as SettingsRow["announcementType"])}
          >
            <option value="info">Info</option>
            <option value="warning">Warning</option>
            <option value="error">Error</option>
          </select>
        </div>
      </SettingsGroup>

      <SettingsGroup title="Email / Notifications" description="SMTP delivery settings for outage and recovery alerts." wide>
        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={settings.smtpShowActionButtons}
            onChange={(e) => set("smtpShowActionButtons", e.target.checked)}
            className="w-4 h-4 accent-indigo-600"
          />
          <span className="text-sm font-medium">Show quick-action buttons in notification emails</span>
        </label>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label htmlFor="cfg-email-from" className={labelCls}>From Address</label>
            <input id="cfg-email-from" type="email" className={inputCls} value={settings.emailFrom ?? ""} onChange={(e) => set("emailFrom", e.target.value)} placeholder="noreply@example.com" />
          </div>
          <div>
            <label htmlFor="cfg-email-replyto" className={labelCls}>Reply-To Address</label>
            <input id="cfg-email-replyto" type="email" className={inputCls} value={settings.emailReplyTo ?? ""} onChange={(e) => set("emailReplyTo", e.target.value)} placeholder="support@example.com" />
          </div>
          <div>
            <label htmlFor="cfg-smtp-host" className={labelCls}>SMTP Host</label>
            <input id="cfg-smtp-host" className={inputCls} value={settings.smtpHost ?? ""} onChange={(e) => set("smtpHost", e.target.value)} placeholder="smtp.example.com" />
          </div>
          <div>
            <label htmlFor="cfg-smtp-port" className={labelCls}>SMTP Port</label>
            <input
              id="cfg-smtp-port"
              type="number"
              min={1}
              max={65535}
              className={inputCls}
              value={settings.smtpPort ?? 587}
              onChange={(e) => set("smtpPort", Number(e.target.value))}
            />
          </div>
          <div>
            <label htmlFor="cfg-smtp-secure" className={labelCls}>SMTP Security</label>
            <select id="cfg-smtp-secure" className={inputCls} value={settings.smtpSecure ?? "tls"} onChange={(e) => set("smtpSecure", e.target.value as SettingsRow["smtpSecure"])}>
              <option value="tls">TLS (STARTTLS)</option>
              <option value="ssl">SSL</option>
              <option value="none">None</option>
            </select>
          </div>
          <div>
            <label htmlFor="cfg-smtp-username" className={labelCls}>SMTP Username</label>
            <input id="cfg-smtp-username" className={inputCls} value={settings.smtpUsername ?? ""} onChange={(e) => set("smtpUsername", e.target.value)} placeholder="you@example.com" />
          </div>
          <div className="sm:col-span-2">
            <label htmlFor="cfg-smtp-password" className={labelCls}>SMTP Password</label>
            <input
              id="cfg-smtp-password"
              type="password"
              className={inputCls}
              value={settings.smtpPassword ?? ""}
              onChange={(e) => set("smtpPassword", e.target.value)}
              placeholder="********"
            />
          </div>
        </div>
        <div className="pt-4 border-t border-slate-100 dark:border-slate-800/70">
          <label htmlFor="cfg-test-email-to" className={labelCls}>Send a Test Email</label>
          <div className="flex items-center gap-3">
            <input
              id="cfg-test-email-to"
              type="email"
              className={`${inputCls} flex-1`}
              value={testTo}
              onChange={(e) => setTestTo(e.target.value)}
              placeholder="Recipient email address"
            />
            <button
              type="button"
              onClick={sendTest}
              disabled={sending || !testTo}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg whitespace-nowrap disabled:opacity-60"
            >
              <i className="fa-solid fa-paper-plane text-xs mr-1.5" /> {sending ? "Sending..." : "Send Test"}
            </button>
          </div>
          {testStatus && (
            <p className={`text-xs mt-2 ${testStatus.ok ? "text-emerald-600" : "text-red-500"}`}>{testStatus.text}</p>
          )}
          <p className="text-xs text-slate-400 mt-1">Uses the saved SMTP settings, save your changes first.</p>
        </div>
      </SettingsGroup>
    </div>
  );
}
