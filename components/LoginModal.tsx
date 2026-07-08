"use client";

import { useState } from "react";

export default function LoginModal({
  onClose,
  onLogin,
}: {
  onClose: () => void;
  onLogin: (username: string, password: string) => Promise<void>;
}) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      await onLogin(username, password);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-sm p-6" onClick={(e) => e.stopPropagation()}>
        <div className="text-center mb-4">
          <div className="w-12 h-12 bg-indigo-50 dark:bg-indigo-500/25 rounded-xl flex items-center justify-center mx-auto mb-3">
            <i className="fa-solid fa-lock text-indigo-600 dark:text-indigo-400 text-lg" />
          </div>
          <h5 className="text-lg font-bold text-slate-900 dark:text-white">Login</h5>
          <p className="text-sm text-slate-500 dark:text-slate-400">Admin access required</p>
        </div>
        {error && (
          <div className="flex items-center gap-2 bg-red-50 dark:bg-red-500/20 border border-red-200 dark:border-red-400/50 text-red-700 dark:text-red-300 rounded-lg px-3 py-2.5 text-sm mb-4">
            <i className="fa-solid fa-circle-xmark flex-shrink-0" /> {error}
          </div>
        )}
        <form onSubmit={handleSubmit} className="space-y-3">
          <input
            autoFocus
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="Username"
            className="w-full px-3 py-2.5 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700/50 text-sm"
          />
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
            className="w-full px-3 py-2.5 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700/50 text-sm"
          />
          <button
            type="submit"
            disabled={submitting}
            className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-sm rounded-lg transition-colors disabled:opacity-60"
          >
            {submitting ? "Logging in..." : "Login"}
          </button>
        </form>
        <button type="button" onClick={onClose} className="w-full mt-2 py-2 text-sm text-slate-400 hover:text-slate-600 dark:hover:text-slate-300">
          Cancel
        </button>
      </div>
    </div>
  );
}
