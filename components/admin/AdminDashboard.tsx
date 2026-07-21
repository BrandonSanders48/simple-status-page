"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useSession } from "@/lib/useSession";
import type { FullConfig, SettingsRow, DraftService, DraftSite, SiteRow, IspMapRow, StatusCategoryRow } from "@/lib/adminTypes";
import GeneralTab from "./GeneralTab";
import ServicesTab from "./ServicesTab";
import SitesTab from "./SitesTab";
import RssTab, { type DraftFeed } from "./RssTab";
import NetworkTab from "./NetworkTab";
import NotificationsTab from "./NotificationsTab";
import SslTab from "./SslTab";
import BackupTab from "./BackupTab";
import StatusCategoriesTab from "./StatusCategoriesTab";

interface SidebarItem {
  key: string;
  label: string;
  icon: string;
  color: string;
  description: string;
  /** Present only for the Integrations item - it lives on its own page (its own save
   * endpoint) rather than as a section here, so it navigates instead of switching. */
  href?: string;
}

/** Grouped by what an admin is actually trying to do, rather than one flat list of 8+
 * items - each category is a small uppercase label in the sidebar, and clicking an
 * item swaps the entire content pane to just that section (no more scrolling past
 * unrelated settings to find one field). */
const CATEGORIES: { label: string; items: SidebarItem[] }[] = [
  {
    label: "Site & Branding",
    items: [
      {
        key: "general",
        label: "General",
        icon: "fa-sliders",
        color: "text-emerald-500",
        description: "Business name, logo, contact details, SLA reporting, and general behaviour.",
      },
    ],
  },
  {
    label: "Monitoring",
    items: [
      {
        key: "sites",
        label: "Sites",
        icon: "fa-building",
        color: "text-cyan-500",
        description: "Group services by physical or network site, with an optional per-site tunnel/link check.",
      },
      {
        key: "services",
        label: "Services",
        icon: "fa-server",
        color: "text-indigo-500",
        description: "The internal hosts and services checked and shown on the status page.",
      },
      {
        key: "categories",
        label: "Status Labels",
        icon: "fa-tags",
        color: "text-pink-500",
        description: "Customize the labels and colors used for status indicators.",
      },
      {
        key: "network",
        label: "Network",
        icon: "fa-network-wired",
        color: "text-sky-500",
        description: "Gateway/DNS checks and ISP detection for the Local-Area and Wide-Area status rows.",
      },
      {
        key: "integrations",
        label: "Integrations",
        icon: "fa-store",
        color: "text-fuchsia-500",
        description: "",
        href: "/admin/integrations",
      },
    ],
  },
  {
    label: "Alerts",
    items: [
      {
        key: "notifications",
        label: "Notifications",
        icon: "fa-bell",
        color: "text-violet-500",
        description: "Email and webhook alerts sent when a service or integration changes status.",
      },
      {
        key: "rss",
        label: "RSS Feeds",
        icon: "fa-rss",
        color: "text-orange-500",
        description: "External RSS feeds displayed alongside the status page.",
      },
    ],
  },
  {
    label: "Advanced",
    items: [
      {
        key: "ssl",
        label: "SSL",
        icon: "fa-lock",
        color: "text-emerald-500",
        description: "Manage the HTTPS certificate used to serve this status page.",
      },
      {
        key: "backup",
        label: "Backup & Restore",
        icon: "fa-database",
        color: "text-slate-500",
        description: "Export the entire database, or restore it from a previously exported backup.",
      },
    ],
  },
];

const SECTIONS = CATEGORIES.flatMap((c) => c.items.filter((i) => !i.href).map((i) => ({ ...i, category: c.label })));

export default function AdminDashboard() {
  const { session } = useSession();
  const [activeKey, setActiveKey] = useState<string>(SECTIONS[0]!.key);
  const [loading, setLoading] = useState(true);
  const [settings, setSettings] = useState<SettingsRow | null>(null);
  const [services, setServices] = useState<DraftService[]>([]);
  const [sites, setSites] = useState<DraftSite[]>([]);
  const [rssFeeds, setRssFeeds] = useState<DraftFeed[]>([]);
  const [ispMap, setIspMap] = useState<IspMapRow[]>([]);
  const [statusCategories, setStatusCategories] = useState<StatusCategoryRow[]>([]);
  const [saveState, setSaveState] = useState<{ ok: boolean; text: string } | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/admin/config");
    if (res.ok) {
      const data: FullConfig = await res.json();
      setSettings(data.settings);
      setServices(data.services);
      setSites(data.sites);
      setRssFeeds(data.rssFeeds);
      setIspMap(data.ispMap);
      setStatusCategories(data.statusCategories);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function handleSave() {
    if (!settings || !session) return;
    setSaving(true);
    setSaveState(null);

    const { id: _id, updatedAt: _updatedAt, configVersion: _configVersion, businessLogoPath: _logo, ...settingsInput } = settings;
    const payload = {
      settings: settingsInput,
      services: services.map(({ id, name, host, port, type, description, visible, siteId }) => ({
        id,
        name,
        host,
        port,
        type,
        description,
        visible,
        siteId,
      })),
      sites: sites.map(({ id, name, tunnelHost, tunnelPort }) => ({ id, name, tunnelHost, tunnelPort })),
      rssFeeds: rssFeeds.map(({ name, host, tag, description }) => ({ name, host, tag, description })),
      ispMap: ispMap.map(({ ip, name }) => ({ ip, name })),
      statusCategories: statusCategories.map(({ key, label, color }) => ({ key, label, color })),
      // integrationTargets intentionally omitted - edited on their own
      // /admin/integrations page now (see configPayloadSchema).
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
      setSites(data.sites);
      setRssFeeds(data.rssFeeds);
      setIspMap(data.ispMap);
      setStatusCategories(data.statusCategories);
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

  const current = SECTIONS.find((s) => s.key === activeKey) ?? SECTIONS[0]!;

  const Comp =
    current.key === "general" ? (
      <GeneralTab settings={settings} onChange={setSettings} csrfToken={session.csrfToken} />
    ) : current.key === "sites" ? (
      <SitesTab sites={sites} onChange={setSites} settings={settings} onSettingsChange={setSettings} />
    ) : current.key === "services" ? (
      <ServicesTab services={services} sites={sites.filter((s): s is SiteRow => s.id !== undefined)} onChange={setServices} />
    ) : current.key === "categories" ? (
      <StatusCategoriesTab categories={statusCategories} onChange={setStatusCategories} />
    ) : current.key === "rss" ? (
      <RssTab feeds={rssFeeds} onChange={setRssFeeds} />
    ) : current.key === "network" ? (
      <NetworkTab settings={settings} onChange={setSettings} ispMap={ispMap} onIspChange={setIspMap} />
    ) : current.key === "notifications" ? (
      <NotificationsTab settings={settings} onChange={setSettings} csrfToken={session.csrfToken} />
    ) : current.key === "ssl" ? (
      <SslTab csrfToken={session.csrfToken} />
    ) : (
      <BackupTab csrfToken={session.csrfToken} />
    );

  return (
    <div className="min-h-screen flex bg-slate-50 dark:bg-[#0d1b30]">
      {/* Sidebar */}
      <aside className="w-64 flex-shrink-0 sticky top-0 h-screen border-r border-slate-200 dark:border-slate-800/70 bg-white dark:bg-slate-900 flex flex-col">
        <div className="h-14 flex items-center px-5 border-b border-slate-100 dark:border-slate-800/70">
          <Link
            href="/"
            className="flex items-center gap-2 text-sm text-slate-500 hover:text-indigo-600 dark:text-slate-400 dark:hover:text-indigo-400 font-medium"
          >
            <i className="fa-solid fa-arrow-left text-xs" /> Status Page
          </Link>
        </div>

        <nav className="flex-1 py-4 px-3 overflow-y-auto">
          {CATEGORIES.map((cat) => (
            <div key={cat.label} className="mb-4 last:mb-0">
              <p className="px-3 mb-1 text-[10.5px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">{cat.label}</p>
              <div className="space-y-0.5">
                {cat.items.map((item) =>
                  item.href ? (
                    <Link
                      key={item.key}
                      href={item.href}
                      className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800/60"
                    >
                      <i className={`fa-solid ${item.icon} w-4 text-center ${item.color}`} />
                      {item.label}
                      <i className="fa-solid fa-arrow-up-right-from-square text-[10px] ml-auto text-slate-400" />
                    </Link>
                  ) : (
                    <button
                      key={item.key}
                      type="button"
                      onClick={() => setActiveKey(item.key)}
                      className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                        activeKey === item.key
                          ? "bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400"
                          : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800/60"
                      }`}
                    >
                      <i className={`fa-solid ${item.icon} w-4 text-center ${activeKey === item.key ? "text-indigo-500" : item.color}`} />
                      {item.label}
                    </button>
                  )
                )}
              </div>
            </div>
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

      {/* Content: only the active section renders - switching sections replaces the
          pane instead of scrolling to an anchor. */}
      <div className="flex-1 min-w-0 px-8 py-8">
        <div className="max-w-4xl mx-auto">
          <div className="mb-6">
            <p className="text-xs font-medium text-slate-400 dark:text-slate-500 uppercase tracking-wide">{current.category}</p>
            <h2 className="text-xl font-semibold text-slate-800 dark:text-slate-100 flex items-center gap-2 mt-1">
              <i className={`fa-solid ${current.icon} ${current.color}`} />
              {current.label}
            </h2>
            {current.description && <p className="text-sm text-slate-500 dark:text-slate-400 mt-1.5 max-w-2xl">{current.description}</p>}
          </div>
          <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-sm p-6">{Comp}</div>
        </div>
      </div>
    </div>
  );
}
