"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useSession } from "@/lib/useSession";
import type { DraftIntegrationTarget } from "@/lib/adminTypes";
import IntegrationsTab from "./IntegrationsTab";

/**
 * Standalone page for the integrations marketplace (PowerStore/Proxmox/PBS/UniFi/
 * Sophos/GoTo Connect/etc), split out of the all-in-one scrolling /admin dashboard so
 * it can grow independently -- saves through its own /api/admin/integration-targets
 * endpoint, scoped to just the integration_targets table, rather than the general
 * config PUT.
 */
export default function IntegrationsAdminPage() {
  const { session } = useSession();
  const [loading, setLoading] = useState(true);
  const [targets, setTargets] = useState<DraftIntegrationTarget[]>([]);
  const [saveState, setSaveState] = useState<{ ok: boolean; text: string } | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/admin/integration-targets");
    if (res.ok) {
      const data = await res.json();
      setTargets(data.integrationTargets);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function handleSave() {
    if (!session) return;
    setSaving(true);
    setSaveState(null);
    try {
      const res = await fetch("/api/admin/integration-targets", {
        method: "PUT",
        headers: { "Content-Type": "application/json", "X-CSRF-Token": session.csrfToken },
        body: JSON.stringify({
          integrationTargets: targets.map(({ id, integration, name, config, enabled, isDr }) => ({
            id,
            integration,
            name,
            config,
            enabled,
            isDr,
          })),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to save.");
      setTargets(data.integrationTargets);
      setSaveState({ ok: true, text: "Integrations saved successfully." });
    } catch (err) {
      setSaveState({ ok: false, text: err instanceof Error ? err.message : "Failed to save." });
    } finally {
      setSaving(false);
      setTimeout(() => setSaveState(null), 4000);
    }
  }

  if (loading || !session) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-[#0d1b30] text-sm text-slate-500 dark:text-slate-400">
        Loading integrations...
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#0d1b30]">
      <div className="h-14 flex items-center justify-between px-5 border-b border-slate-200 dark:border-slate-800/70 bg-white dark:bg-slate-900">
        <Link
          href="/admin"
          className="flex items-center gap-2 text-sm text-slate-500 hover:text-indigo-600 dark:text-slate-400 dark:hover:text-indigo-400 font-medium"
        >
          <i className="fa-solid fa-arrow-left text-xs" /> Admin
        </Link>
        <div className="flex items-center gap-3">
          {saveState && (
            <p className={`text-xs ${saveState.ok ? "text-emerald-600 dark:text-emerald-400" : "text-red-500"}`}>{saveState.text}</p>
          )}
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="flex items-center justify-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold rounded-lg transition-colors disabled:opacity-60"
          >
            <i className="fa-solid fa-floppy-disk text-xs" /> {saving ? "Saving..." : "Save Changes"}
          </button>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-8 py-8">
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-sm p-6">
          <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100 flex items-center gap-2 mb-4 pb-3 border-b-2 border-slate-200 dark:border-slate-700">
            <i className="fa-solid fa-store text-fuchsia-500" />
            Integrations
          </h2>
          <IntegrationsTab integrationTargets={targets} onIntegrationTargetsChange={setTargets} csrfToken={session.csrfToken} />
        </div>
      </div>
    </div>
  );
}
