"use client";

import { useState } from "react";
import type { StatusServicePayload, SitePayload } from "@/lib/statusCache";
import { getIntegrationCatalogMeta } from "@/lib/integrationCatalogMeta";
import { getSavedSubscriberEmail, saveSubscriberEmail } from "@/lib/subscriberEmail";

interface IntegrationTargetOption {
  id: number;
  name: string;
  integration: string;
}

type Mode = "everything" | "custom";

export default function SubscribeModal({
  services,
  sites,
  integrationTargets = [],
  smsAvailable = false,
  csrfToken,
  onClose,
  onManage,
}: {
  services: StatusServicePayload[];
  sites: SitePayload[];
  integrationTargets?: IntegrationTargetOption[];
  /** Whether a GoTo Connect target is enabled with an SMS From number configured (see
   * lib/integrationTargets.ts's isGotoSmsAvailable) - a phone number is only accepted
   * in the contact field below when this is true, since otherwise nothing could ever
   * text it. */
  smsAvailable?: boolean;
  csrfToken: string;
  onClose: () => void;
  onManage: () => void;
}) {
  const [mode, setMode] = useState<Mode>("everything");
  const [contact, setContact] = useState(getSavedSubscriberEmail);
  const [selectedServices, setSelectedServices] = useState<Set<number>>(new Set());
  const [selectedSites, setSelectedSites] = useState<Set<number>>(new Set());
  const [selectedTargets, setSelectedTargets] = useState<Set<number>>(new Set());
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const siteNameById = new Map(sites.map((s) => [s.id, s.name]));
  const allServicesSelected = services.length > 0 && selectedServices.size === services.length;
  const customSelectedCount = selectedServices.size + selectedSites.size + selectedTargets.size;

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

  function toggleTarget(id: number) {
    setSelectedTargets((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);

    const serviceIds = mode === "everything" ? services.map((s) => s.id) : Array.from(selectedServices);
    const siteIds = mode === "everything" ? sites.map((s) => s.id) : Array.from(selectedSites);
    const targetIds = mode === "everything" ? integrationTargets.map((t) => t.id) : Array.from(selectedTargets);

    if (serviceIds.length === 0 && siteIds.length === 0 && targetIds.length === 0) {
      setMessage({ ok: false, text: "Please select at least one service, site, or integration." });
      return;
    }
    const trimmed = contact.trim();
    const isEmail = trimmed.includes("@");

    if (!isEmail && !smsAvailable) {
      setMessage({ ok: false, text: "Phone/SMS subscriptions aren't available right now. Please enter an email address instead." });
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-CSRF-Token": csrfToken },
        body: JSON.stringify(isEmail ? { email: trimmed, serviceIds, siteIds, targetIds } : { phone: trimmed, serviceIds, siteIds, targetIds }),
      });
      const data = await res.json();
      setMessage({ ok: res.ok, text: data.message || (res.ok ? "Subscribed!" : "Failed to subscribe.") });
      if (res.ok) {
        saveSubscriberEmail(trimmed);
        setSelectedServices(new Set());
        setSelectedSites(new Set());
        setSelectedTargets(new Set());
      }
    } catch {
      setMessage({ ok: false, text: "Failed to subscribe." });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-2xl p-6 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h5 className="font-semibold text-slate-900 dark:text-white text-sm">Subscribe to Alerts</h5>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              {smsAvailable ? "Get emailed or texted" : "Get emailed"} when services, sites, or integrations have issues
            </p>
          </div>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-600 text-2xl leading-none">
            &times;
          </button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <input
              required
              type="text"
              value={contact}
              onChange={(e) => setContact(e.target.value)}
              placeholder={smsAvailable ? "you@example.com or +15145550100" : "you@example.com"}
              className="w-full px-3 py-2.5 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700/50 text-sm"
            />
            <p className="text-xs text-slate-400 mt-1">
              {smsAvailable
                ? "Enter an email address to get emailed, or a phone number (with country code) to get texted."
                : "Enter an email address to get emailed."}
            </p>
          </div>

          <div className="rounded-lg border border-slate-200 dark:border-slate-700/60 divide-y divide-slate-100 dark:divide-slate-700/40">
            <label className="flex items-start gap-3 px-3 py-2.5 hover:bg-slate-50 dark:hover:bg-slate-700/40 cursor-pointer">
              <input
                type="radio"
                name="subscribe-mode"
                checked={mode === "everything"}
                onChange={() => setMode("everything")}
                className="w-4 h-4 mt-0.5 accent-emerald-500 flex-shrink-0"
              />
              <span>
                <span className="block text-sm font-medium text-slate-800 dark:text-slate-200">Notify me about everything</span>
                <span className="block text-xs text-slate-400 mt-0.5">Every service, site, and integration currently configured.</span>
              </span>
            </label>
            <label className="flex items-start gap-3 px-3 py-2.5 hover:bg-slate-50 dark:hover:bg-slate-700/40 cursor-pointer">
              <input
                type="radio"
                name="subscribe-mode"
                checked={mode === "custom"}
                onChange={() => setMode("custom")}
                className="w-4 h-4 mt-0.5 accent-emerald-500 flex-shrink-0"
              />
              <span>
                <span className="block text-sm font-medium text-slate-800 dark:text-slate-200">Let me choose what to watch</span>
                <span className="block text-xs text-slate-400 mt-0.5">Pick specific services, sites, or integrations below.</span>
              </span>
            </label>
          </div>

          {mode === "custom" && (
            <div className="space-y-4">
              {sites.length > 0 && (
                <div>
                  <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-2 flex items-center gap-1.5">
                    <i className="fa-solid fa-building text-cyan-500 text-[11px]" /> Sites{" "}
                    <span className="font-normal normal-case text-slate-400">(tunnel/link alerts)</span>
                  </label>
                  <div className="max-h-[180px] overflow-y-auto rounded-lg border border-slate-200 dark:border-slate-700/60 divide-y divide-slate-100 dark:divide-slate-700/40">
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

              {integrationTargets.length > 0 && (
                <div>
                  <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-2 flex items-center gap-1.5">
                    <i className="fa-solid fa-store text-fuchsia-500 text-[11px]" /> Integrations{" "}
                    <span className="font-normal normal-case text-slate-400">(healthy/attention alerts)</span>
                  </label>
                  <div className="max-h-[180px] overflow-y-auto rounded-lg border border-slate-200 dark:border-slate-700/60 divide-y divide-slate-100 dark:divide-slate-700/40">
                    {integrationTargets.map((t) => (
                      <label key={t.id} className="flex items-center gap-3 px-3 py-2.5 hover:bg-slate-50 dark:hover:bg-slate-700/40 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={selectedTargets.has(t.id)}
                          onChange={() => toggleTarget(t.id)}
                          className="w-4 h-4 rounded accent-fuchsia-500 flex-shrink-0"
                        />
                        <span className="text-sm text-slate-800 dark:text-slate-200 font-medium flex-1">
                          {t.name}
                          <span className="text-slate-400 font-normal"> ({getIntegrationCatalogMeta(t.integration)?.label ?? t.integration})</span>
                        </span>
                      </label>
                    ))}
                  </div>
                </div>
              )}

              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide flex items-center gap-1.5">
                    <i className="fa-solid fa-server text-emerald-500 text-[11px]" /> Services
                  </label>
                  <button type="button" onClick={toggleAllServices} className="text-xs text-emerald-600 dark:text-emerald-400 hover:underline font-medium">
                    {allServicesSelected ? "Deselect all" : "Select all"}
                  </button>
                </div>
                <div className="max-h-[260px] overflow-y-auto rounded-lg border border-slate-200 dark:border-slate-700/60 divide-y divide-slate-100 dark:divide-slate-700/40">
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
            </div>
          )}

          {message && (
            <p className={`text-sm ${message.ok ? "text-emerald-600 dark:text-emerald-400" : "text-red-500"}`}>{message.text}</p>
          )}
          <div className="flex items-center justify-between pt-1">
            <button type="button" onClick={onManage} className="text-xs text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 flex items-center gap-1.5">
              <i className="fa-solid fa-gear text-xs" /> Manage
            </button>
            <div className="flex items-center gap-3">
              {mode === "custom" && customSelectedCount > 0 && (
                <span className="text-xs text-slate-400">{customSelectedCount} selected</span>
              )}
              <button
                type="submit"
                disabled={submitting}
                className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold rounded-lg transition-colors disabled:opacity-60"
              >
                Subscribe
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
