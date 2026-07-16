"use client";

import { useState } from "react";

type PostType = "incident" | "maintenance";

export default function CreatePostModal({
  csrfToken,
  onClose,
  onCreated,
}: {
  csrfToken: string;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [type, setType] = useState<PostType>("incident");
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
      const isIncident = type === "incident";
      const res = await fetch(isIncident ? "/api/incidents" : "/api/maintenance", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-CSRF-Token": csrfToken },
        body: JSON.stringify({
          title,
          description,
          ...(isIncident ? { severity } : {}),
          start_time: startTime,
          end_time: endTime || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `Failed to ${isIncident ? "create incident" : "schedule maintenance"}.`);
      onCreated();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to submit.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h5 className="font-semibold text-slate-900 dark:text-white flex items-center gap-2">
            <i className={`fa-solid ${type === "incident" ? "fa-triangle-exclamation text-amber-500" : "fa-wrench text-indigo-500"}`} />
            {type === "incident" ? "Create Incident" : "Schedule Maintenance"}
          </h5>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-600 text-2xl leading-none">
            &times;
          </button>
        </div>

        <div className="flex gap-2 mb-4">
          <button
            type="button"
            onClick={() => setType("incident")}
            className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
              type === "incident"
                ? "bg-amber-500 text-white"
                : "bg-slate-100 dark:bg-slate-700/60 text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700"
            }`}
          >
            <i className="fa-solid fa-triangle-exclamation text-xs mr-1.5" /> Incident
          </button>
          <button
            type="button"
            onClick={() => setType("maintenance")}
            className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
              type === "maintenance"
                ? "bg-indigo-600 text-white"
                : "bg-slate-100 dark:bg-slate-700/60 text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700"
            }`}
          >
            <i className="fa-solid fa-wrench text-xs mr-1.5" /> Maintenance
          </button>
        </div>

        {error && <p className="text-sm text-red-500 mb-3">{error}</p>}
        <form onSubmit={handleSubmit} className="space-y-3">
          <input
            required
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={type === "incident" ? "Title, e.g. Email service outage" : "Title, e.g. Database maintenance window"}
            className="w-full px-3 py-2.5 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700/50 text-sm"
          />
          {type === "incident" && (
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
          )}
          <textarea
            required={type === "incident"}
            rows={3}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={
              type === "incident"
                ? "Describe what is happening and affected services..."
                : "What's happening and what to expect..."
            }
            className="w-full px-3 py-2.5 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700/50 text-sm resize-none"
          />
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-slate-400 mb-1">Starts</label>
              <input
                required
                type="datetime-local"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                className="w-full px-3 py-2.5 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700/50 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Ends (optional)</label>
              <input
                type="datetime-local"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                className="w-full px-3 py-2.5 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700/50 text-sm"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-slate-500 hover:text-slate-700 dark:hover:text-slate-200">
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className={`px-5 py-2 text-white text-sm font-semibold rounded-lg transition-colors disabled:opacity-60 ${
                type === "incident" ? "bg-amber-500 hover:bg-amber-400" : "bg-indigo-600 hover:bg-indigo-500"
              }`}
            >
              {type === "incident" ? "Post Incident" : "Schedule"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
