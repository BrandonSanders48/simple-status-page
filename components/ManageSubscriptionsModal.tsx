"use client";

import { useState } from "react";

interface Subscription {
  serviceId: number;
  serviceName: string;
}

export default function ManageSubscriptionsModal({
  csrfToken,
  onClose,
  onBack,
}: {
  csrfToken: string;
  onClose: () => void;
  onBack: () => void;
}) {
  const [email, setEmail] = useState("");
  const [subscriptions, setSubscriptions] = useState<Subscription[] | null>(null);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  async function lookup() {
    if (!email.trim()) {
      setMessage("Please enter your email address.");
      return;
    }
    setLoading(true);
    setMessage("");
    try {
      const res = await fetch("/api/subscriptions", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-CSRF-Token": csrfToken },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      setSubscriptions(data.subscriptions ?? []);
      if (data.message) setMessage(data.message);
    } catch {
      setMessage("Failed to look up subscriptions.");
    } finally {
      setLoading(false);
    }
  }

  async function unsubscribeOne(serviceId: number) {
    const res = await fetch("/api/unsubscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-CSRF-Token": csrfToken },
      body: JSON.stringify({ email, action: "unsubscribe_single", serviceId }),
    });
    const data = await res.json();
    if (data.status === "success") {
      setSubscriptions((prev) => (prev ? prev.filter((s) => s.serviceId !== serviceId) : prev));
    }
    setMessage(data.message || "");
  }

  async function unsubscribeAll() {
    const res = await fetch("/api/unsubscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-CSRF-Token": csrfToken },
      body: JSON.stringify({ email, action: "unsubscribe" }),
    });
    const data = await res.json();
    setMessage(data.message || "");
    if (data.status === "success") setSubscriptions([]);
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-3 mb-4">
          <div className="w-9 h-9 bg-red-50 dark:bg-red-500/25 rounded-lg flex items-center justify-center flex-shrink-0">
            <i className="fa-solid fa-bell-slash text-red-500 dark:text-red-400" />
          </div>
          <div className="flex-1">
            <h5 className="font-semibold text-slate-900 dark:text-white text-sm">Manage Subscriptions</h5>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Look up and manage your alerts</p>
          </div>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-600 text-2xl leading-none">
            &times;
          </button>
        </div>

        <div className="flex gap-2 mb-3">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && lookup()}
            placeholder="you@example.com"
            className="flex-1 px-3 py-2.5 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700/50 text-sm"
          />
          <button
            type="button"
            onClick={lookup}
            disabled={loading}
            className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold rounded-lg disabled:opacity-60"
          >
            <i className="fa-solid fa-magnifying-glass mr-1.5" /> Look Up
          </button>
        </div>

        {message && <p className="text-sm text-slate-600 dark:text-slate-300 mb-3">{message}</p>}

        {subscriptions && (
          <div className="mb-4">
            {subscriptions.length === 0 ? (
              <p className="text-sm text-slate-500 dark:text-slate-400 text-center py-3">No active subscriptions found.</p>
            ) : (
              <ul className="space-y-2 max-h-56 overflow-y-auto rounded-lg border border-slate-200 dark:border-slate-700/60 divide-y divide-slate-100 dark:divide-slate-700/40">
                {subscriptions.map((sub) => (
                  <li key={sub.serviceId} className="flex items-center justify-between px-3 py-2.5">
                    <span className="text-sm text-slate-800 dark:text-slate-200 font-medium">{sub.serviceName}</span>
                    <button
                      type="button"
                      onClick={() => unsubscribeOne(sub.serviceId)}
                      className="text-xs bg-red-50 dark:bg-red-500/25 hover:bg-red-100 dark:hover:bg-red-500/40 text-red-600 dark:text-red-300 px-2.5 py-1 rounded-md font-medium"
                    >
                      Unsubscribe
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        <div className="flex items-center justify-between gap-2">
          {subscriptions && subscriptions.length > 0 ? (
            <button
              type="button"
              onClick={unsubscribeAll}
              className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white text-sm font-semibold rounded-lg"
            >
              <i className="fa-solid fa-trash-can mr-1.5" /> Unsubscribe from All
            </button>
          ) : (
            <span />
          )}
          <button type="button" onClick={onBack} className="px-4 py-2 text-sm text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-700 rounded-lg">
            <i className="fa-solid fa-arrow-left mr-1" /> Back
          </button>
        </div>
      </div>
    </div>
  );
}
