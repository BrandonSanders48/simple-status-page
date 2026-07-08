"use client";

import { useState } from "react";
import type { StatusServicePayload } from "@/lib/statusCache";

export default function SubscribeModal({
  services,
  csrfToken,
  onClose,
  onManage,
}: {
  services: StatusServicePayload[];
  csrfToken: string;
  onClose: () => void;
  onManage: () => void;
}) {
  const [email, setEmail] = useState("");
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const allSelected = services.length > 0 && selected.size === services.length;

  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(services.map((s) => s.id)));
  }

  function toggleOne(id: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);
    if (selected.size === 0) {
      setMessage({ ok: false, text: "Please select at least one service." });
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-CSRF-Token": csrfToken },
        body: JSON.stringify({ email, serviceIds: Array.from(selected) }),
      });
      const data = await res.json();
      setMessage({ ok: res.ok, text: data.message || (res.ok ? "Subscribed!" : "Failed to subscribe.") });
      if (res.ok) {
        setEmail("");
        setSelected(new Set());
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
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Get emailed when services go down</p>
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
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">
                Select Services
              </label>
              <button type="button" onClick={toggleAll} className="text-xs text-emerald-600 dark:text-emerald-400 hover:underline font-medium">
                {allSelected ? "Deselect all" : "Select all"}
              </button>
            </div>
            <div className="max-h-[280px] overflow-y-auto rounded-lg border border-slate-200 dark:border-slate-700/60 divide-y divide-slate-100 dark:divide-slate-700/40">
              {services.map((s) => (
                <label key={s.id} className="flex items-center gap-3 px-3 py-2.5 hover:bg-slate-50 dark:hover:bg-slate-700/40 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selected.has(s.id)}
                    onChange={() => toggleOne(s.id)}
                    className="w-4 h-4 rounded accent-emerald-500 flex-shrink-0"
                  />
                  <span className="text-sm text-slate-800 dark:text-slate-200 font-medium flex-1">{s.name}</span>
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
