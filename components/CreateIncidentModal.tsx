"use client";

import { useState } from "react";

export default function CreateIncidentModal({
  csrfToken,
  onClose,
  onCreated,
}: {
  csrfToken: string;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [severity, setSeverity] = useState("outage");
  const [startTime, setStartTime] = useState(() => new Date().toISOString().slice(0, 16));
  const [endTime, setEndTime] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      const res = await fetch("/api/incidents", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-CSRF-Token": csrfToken },
        body: JSON.stringify({ title, description, severity, start_time: startTime, end_time: endTime || null }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to create incident.");
      onCreated();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create incident.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h5 className="font-semibold text-slate-900 dark:text-white flex items-center gap-2">
            <i className="fa-solid fa-triangle-exclamation text-amber-500" /> Create Incident
          </h5>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-600 text-2xl leading-none">
            &times;
          </button>
        </div>
        {error && <p className="text-sm text-red-500 mb-3">{error}</p>}
        <form onSubmit={handleSubmit} className="space-y-3">
          <input
            required
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Title, e.g. Email service outage"
            className="w-full px-3 py-2.5 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700/50 text-sm"
          />
          <select
            aria-label="Severity"
            value={severity}
            onChange={(e) => setSeverity(e.target.value)}
            className="w-full px-3 py-2.5 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700/50 text-sm"
          >
            <option value="degraded">Degraded Performance</option>
            <option value="outage">Outage</option>
            <option value="maintenance">Scheduled Maintenance</option>
            <option value="resolved">Resolved</option>
          </select>
          <textarea
            required
            rows={3}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Describe what is happening and affected services..."
            className="w-full px-3 py-2.5 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700/50 text-sm resize-none"
          />
          <div className="grid grid-cols-2 gap-3">
            <input
              required
              type="datetime-local"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
              className="w-full px-3 py-2.5 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700/50 text-sm"
            />
            <input
              type="datetime-local"
              value={endTime}
              onChange={(e) => setEndTime(e.target.value)}
              className="w-full px-3 py-2.5 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700/50 text-sm"
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-slate-500 hover:text-slate-700 dark:hover:text-slate-200">
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-5 py-2 bg-amber-500 hover:bg-amber-400 text-white text-sm font-semibold rounded-lg transition-colors disabled:opacity-60"
            >
              Post Incident
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
