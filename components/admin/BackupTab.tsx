"use client";

import { useRef, useState } from "react";
import { SettingsGroup } from "./SettingsGroup";

export default function BackupTab({ csrfToken }: { csrfToken: string }) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);

  async function handleImport(file: File) {
    const confirmed = window.confirm(
      "This will REPLACE the entire database (settings, services, sites, subscriptions, outage history, everything) with the contents of this file.\n\n" +
        "The current database is saved as a safety copy first, but the app will need a manual restart afterward to load the new one -- every page will show errors until you restart it.\n\n" +
        "Continue?"
    );
    if (!confirmed) {
      if (fileInput.current) fileInput.current.value = "";
      return;
    }

    setImporting(true);
    setResult(null);
    const formData = new FormData();
    formData.append("file", file);
    try {
      const res = await fetch("/api/admin/import-db", {
        method: "POST",
        headers: { "X-CSRF-Token": csrfToken },
        body: formData,
      });
      const data = await res.json();
      setResult({ ok: res.ok, text: res.ok ? data.message : data.error || "Import failed." });
    } catch {
      setResult({ ok: false, text: "Import failed." });
    } finally {
      setImporting(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  return (
    <div>
      <SettingsGroup
        title="Export"
        description="Download a complete, consistent snapshot of the database -- settings, services, sites, subscriptions, outage history, everything."
      >
        <a
          href="/api/admin/export-db"
          className="inline-flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold rounded-lg transition-colors"
        >
          <i className="fa-solid fa-download text-xs" /> Download Backup
        </a>
      </SettingsGroup>

      <SettingsGroup
        title="Import"
        description="Restore the database from a previously exported backup file. This replaces everything currently stored, so use with care."
      >
        <div>
          <button
            type="button"
            onClick={() => fileInput.current?.click()}
            disabled={importing}
            className="flex items-center gap-1.5 px-4 py-2 bg-red-50 hover:bg-red-100 dark:bg-red-500/20 dark:hover:bg-red-500/30 text-red-600 dark:text-red-300 text-sm font-semibold rounded-lg border border-red-200 dark:border-red-400/40 disabled:opacity-60"
          >
            <i className="fa-solid fa-upload text-xs" /> {importing ? "Importing..." : "Upload and Restore"}
          </button>
          <input
            ref={fileInput}
            type="file"
            aria-label="Upload database backup"
            accept=".db"
            className="hidden"
            onChange={(e) => e.target.files?.[0] && handleImport(e.target.files[0])}
          />
          {result && (
            <p className={`text-xs mt-2 leading-relaxed ${result.ok ? "text-emerald-600 dark:text-emerald-400" : "text-red-500"}`}>
              {result.text}
            </p>
          )}
        </div>
        <div className="p-3 bg-amber-50 dark:bg-amber-500/20 border border-amber-200 dark:border-amber-400/40 rounded-lg text-xs text-amber-700 dark:text-amber-200">
          <i className="fa-solid fa-triangle-exclamation mr-1" />
          Importing replaces the whole database immediately and requires a manual restart of the app afterward to take effect. A copy
          of the database being replaced is saved automatically before the swap.
        </div>
      </SettingsGroup>
    </div>
  );
}
