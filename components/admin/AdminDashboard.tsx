"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSession } from "@/lib/useSession";
import type { FullConfig, SettingsRow, DraftService, IspMapRow } from "@/lib/adminTypes";
import GeneralTab from "./GeneralTab";
import ServicesTab from "./ServicesTab";
import RssTab, { type DraftFeed } from "./RssTab";
import NetworkTab from "./NetworkTab";
import NotificationsTab from "./NotificationsTab";
import SslTab from "./SslTab";
import StorageTab from "./StorageTab";

const SECTIONS = [
  { key: "general", label: "General", icon: "fa-sliders", color: "text-emerald-500" },
  { key: "services", label: "Services", icon: "fa-server", color: "text-indigo-500" },
  { key: "rss", label: "RSS Feeds", icon: "fa-rss", color: "text-orange-500" },
  { key: "network", label: "Network", icon: "fa-network-wired", color: "text-sky-500" },
  { key: "storage", label: "Storage", icon: "fa-database", color: "text-cyan-500" },
  { key: "notifications", label: "Notifications", icon: "fa-bell", color: "text-violet-500" },
  { key: "ssl", label: "SSL", icon: "fa-lock", color: "text-emerald-500" },
] as const;

export default function AdminDashboard() {
  const { session } = useSession();
  const [activeKey, setActiveKey] = useState<string>(SECTIONS[0].key);
  const [loading, setLoading] = useState(true);
  const [settings, setSettings] = useState<SettingsRow | null>(null);
  const [services, setServices] = useState<DraftService[]>([]);
  const [rssFeeds, setRssFeeds] = useState<DraftFeed[]>([]);
  const [ispMap, setIspMap] = useState<IspMapRow[]>([]);
  const [saveState, setSaveState] = useState<{ ok: boolean; text: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const sectionRefs = useRef<Record<string, HTMLElement | null>>({});

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/admin/config");
    if (res.ok) {
      const data: FullConfig = await res.json();
      setSettings(data.settings);
      setServices(data.services);
      setRssFeeds(data.rssFeeds);
      setIspMap(data.ispMap);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Highlight the sidebar link for whichever section is currently in view.
  useEffect(() => {
    if (loading) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActiveKey(visible[0].target.id);
      },
      { rootMargin: "-96px 0px -70% 0px", threshold: 0 }
    );
    for (const key of Object.keys(sectionRefs.current)) {
      const el = sectionRefs.current[key];
      if (el) observer.observe(el);
    }
    return () => observer.disconnect();
  }, [loading]);

  function scrollToSection(key: string) {
    sectionRefs.current[key]?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  async function handleSave() {
    if (!settings || !session) return;
    setSaving(true);
    setSaveState(null);

    const { id: _id, updatedAt: _updatedAt, configVersion: _configVersion, businessLogoPath: _logo, ...settingsInput } = settings;
    const payload = {
      settings: settingsInput,
      services: services.map(({ id, name, host, port, type, description, visible }) => ({
        id,
        name,
        host,
        port,
        type,
        description,
        visible,
      })),
      rssFeeds: rssFeeds.map(({ name, host, tag, description }) => ({ name, host, tag, description })),
      ispMap: ispMap.map(({ ip, name }) => ({ ip, name })),
    };

    try {
      const res = await fetch("/api/admin/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json", "X-CSRF-Token": session.csrfToken },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to save.");
      setSettings(data.settings);
      setServices(data.services);
      setRssFeeds(data.rssFeeds);
      setIspMap(data.ispMap);
      setSaveState({ ok: true, text: "Configuration saved successfully." });
    } catch (err) {
      setSaveState({ ok: false, text: err instanceof Error ? err.message : "Failed to save." });
    } finally {
      setSaving(false);
      setTimeout(() => setSaveState(null), 4000);
    }
  }

  if (loading || !settings || !session) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-[#0d1b30] text-sm text-slate-500 dark:text-slate-400">
        Loading configuration...
      </div>
    );
  }

  return (
    <div className="min-h-screen flex bg-slate-50 dark:bg-[#0d1b30]">
      {/* Sidebar */}
      <aside className="w-60 flex-shrink-0 sticky top-0 h-screen border-r border-slate-200 dark:border-slate-800/70 bg-white dark:bg-slate-900 flex flex-col">
        <div className="h-14 flex items-center px-5 border-b border-slate-100 dark:border-slate-800/70">
          <Link
            href="/"
            className="flex items-center gap-2 text-sm text-slate-500 hover:text-indigo-600 dark:text-slate-400 dark:hover:text-indigo-400 font-medium"
          >
            <i className="fa-solid fa-arrow-left text-xs" /> Status Page
          </Link>
        </div>

        <nav className="flex-1 py-4 px-3 space-y-1 overflow-y-auto">
          {SECTIONS.map((s) => (
            <button
              key={s.key}
              type="button"
              onClick={() => scrollToSection(s.key)}
              className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                activeKey === s.key
                  ? "bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400"
                  : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800/60"
              }`}
            >
              <i className={`fa-solid ${s.icon} w-4 text-center ${activeKey === s.key ? "text-indigo-500" : s.color}`} />
              {s.label}
            </button>
          ))}
        </nav>

        <div className="p-3 border-t border-slate-100 dark:border-slate-800/70">
          {saveState && (
            <p className={`text-xs mb-2 ${saveState.ok ? "text-emerald-600 dark:text-emerald-400" : "text-red-500"}`}>
              {saveState.text}
            </p>
          )}
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="w-full flex items-center justify-center gap-1.5 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold rounded-lg transition-colors disabled:opacity-60"
          >
            <i className="fa-solid fa-floppy-disk text-xs" /> {saving ? "Saving..." : "Save Changes"}
          </button>
        </div>
      </aside>

      {/* Content: every section rendered at once, scrollable, sidebar jumps to anchors */}
      <div className="flex-1 min-w-0 px-8 py-8">
       <div className="max-w-4xl mx-auto space-y-10">
        {SECTIONS.map((s) => {
          const Comp =
            s.key === "general" ? (
              <GeneralTab settings={settings} onChange={setSettings} csrfToken={session.csrfToken} />
            ) : s.key === "services" ? (
              <ServicesTab services={services} onChange={setServices} />
            ) : s.key === "rss" ? (
              <RssTab feeds={rssFeeds} onChange={setRssFeeds} />
            ) : s.key === "network" ? (
              <NetworkTab settings={settings} onChange={setSettings} ispMap={ispMap} onIspChange={setIspMap} />
            ) : s.key === "storage" ? (
              <StorageTab settings={settings} onChange={setSettings} csrfToken={session.csrfToken} />
            ) : s.key === "notifications" ? (
              <NotificationsTab settings={settings} onChange={setSettings} csrfToken={session.csrfToken} />
            ) : (
              <SslTab csrfToken={session.csrfToken} />
            );

          return (
            <section
              key={s.key}
              id={s.key}
              ref={(el) => {
                sectionRefs.current[s.key] = el;
              }}
              className="scroll-mt-6"
            >
              <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100 flex items-center gap-2 mb-1 pb-3 border-b-2 border-slate-200 dark:border-slate-700">
                <i className={`fa-solid ${s.icon} ${s.color}`} />
                {s.label}
              </h2>
              {Comp}
            </section>
          );
        })}
       </div>
      </div>
    </div>
  );
}
