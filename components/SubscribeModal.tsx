"use client";

import { useState } from "react";
import type { StatusServicePayload, SitePayload } from "@/lib/statusCache";

export default function SubscribeModal({
  services,
  sites,
  csrfToken,
  onClose,
  onManage,
}: {
  services: StatusServicePayload[];
  sites: SitePayload[];
  csrfToken: string;
  onClose: () => void;
  onManage: () => void;
}) {
  const [email, setEmail] = useState("");
  const [selectedServices, setSelectedServices] = useState<Set<number>>(new Set());
  const [selectedSites, setSelectedSites] = useState<Set<number>>(new Set());
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const siteNameById = new Map(sites.map((s) => [s.id, s.name]));
  const allServicesSelected = services.length > 0 && selectedServices.size === services.length;

  function toggleAllServices() {
    setSelectedServices(allServicesSelected ? new Set() : new Set(services.map((s) => s.id)));
  }

  function toggleService(id: number) {
    setSelectedServices((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSite(id: number) {
    setSelectedSites((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);
    if (selectedServices.size === 0 && selectedSites.size === 0) {
      setMessage({ ok: false, text: "Please select at least one service or site." });
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-CSRF-Token": csrfToken },
        body: JSON.stringify({ email, serviceIds: Array.from(selectedServices), siteIds: Array.from(selectedSites) }),
      });
      const data = await res.json();
      setMessage({ ok: res.ok, text: data.message || (res.ok ? "Subscribed!" : "Failed to subscribe.") });
      if (res.ok) {
        setEmail("");
        setSelectedServices(new Set());
        setSelectedSites(new Set());
      }
    } catch {
      setMessage({ ok: false, text: "Failed to subscribe." });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-lg p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h5 className="font-semibold text-slate-900 dark:text-white text-sm">Subscribe to Alerts</h5>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Get emailed when services or sites go down</p>
          </div>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-600 text-2xl leading-none">
            &times;
          </button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <input
            required
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            className="w-full px-3 py-2.5 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700/50 text-sm"
          />

          {sites.length > 0 && (
            <div>
              <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-2 block">
                Sites <span className="font-normal normal-case text-slate-400">(tunnel/link alerts)</span>
              </label>
              <div className="rounded-lg border border-slate-200 dark:border-slate-700/60 divide-y divide-slate-100 dark:divide-slate-700/40">
                {sites.map((s) => (
                  <label key={s.id} className="flex items-center gap-3 px-3 py-2.5 hover:bg-slate-50 dark:hover:bg-slate-700/40 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={selectedSites.has(s.id)}
                      onChange={() => toggleSite(s.id)}
                      className="w-4 h-4 rounded accent-cyan-500 flex-shrink-0"
                    />
                    <span className="text-sm text-slate-800 dark:text-slate-200 font-medium flex-1">{s.name}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">
                Select Services
              </label>
              <button type="button" onClick={toggleAllServices} className="text-xs text-emerald-600 dark:text-emerald-400 hover:underline font-medium">
                {allServicesSelected ? "Deselect all" : "Select all"}
              </button>
            </div>
            <div className="max-h-[240px] overflow-y-auto rounded-lg border border-slate-200 dark:border-slate-700/60 divide-y divide-slate-100 dark:divide-slate-700/40">
              {services.map((s) => (
                <label key={s.id} className="flex items-center gap-3 px-3 py-2.5 hover:bg-slate-50 dark:hover:bg-slate-700/40 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selectedServices.has(s.id)}
                    onChange={() => toggleService(s.id)}
                    className="w-4 h-4 rounded accent-emerald-500 flex-shrink-0"
                  />
                  <span className="text-sm text-slate-800 dark:text-slate-200 font-medium flex-1">{s.name}</span>
                  {s.siteId !== null && siteNameById.has(s.siteId) && (
                    <span className="text-[10.5px] font-medium text-cyan-700 dark:text-cyan-300 bg-cyan-50 dark:bg-cyan-500/15 px-1.5 py-0.5 rounded-full flex-shrink-0">
                      {siteNameById.get(s.siteId)}
                    </span>
                  )}
                </label>
              ))}
            </div>
          </div>

          {message && (
            <p className={`text-sm ${message.ok ? "text-emerald-600 dark:text-emerald-400" : "text-red-500"}`}>{message.text}</p>
          )}
          <div className="flex items-center justify-between pt-1">
            <button type="button" onClick={onManage} className="text-xs text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 flex items-center gap-1.5">
              <i className="fa-solid fa-gear text-xs" /> Manage
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold rounded-lg transition-colors disabled:opacity-60"
            >
              Subscribe
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
