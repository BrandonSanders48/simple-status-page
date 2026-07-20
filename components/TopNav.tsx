"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import DarkModeToggle from "./DarkModeToggle";
import SlaBadge from "./SlaBadge";

/**
 * Shared nav bar (logo/business name/SLA badge/auto-refresh notice/dark mode toggle/
 * admin-or-login button) between the main status page and the standalone Integrations
 * page -- `rightExtra` is a slot for a page-specific link (e.g. "Integrations" on the
 * main page, "Status Page" back-link on the Integrations page) without duplicating
 * the rest of the markup.
 */
export default function TopNav({
  businessName,
  logoPath = null,
  refreshRateMs,
  initialDark = false,
  isAdmin,
  onLoginClick,
  onLogout,
  rightExtra,
}: {
  businessName: string;
  logoPath?: string | null;
  refreshRateMs: number;
  initialDark?: boolean;
  isAdmin: boolean;
  onLoginClick: () => void;
  onLogout: () => void;
  rightExtra?: ReactNode;
}) {
  return (
    <nav className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800/60">
      <div className="max-w-screen-xl mx-auto px-4 h-14 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          {logoPath && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logoPath} alt={businessName} className="h-8 w-auto rounded bg-white p-0.5 object-contain" />
          )}
          <div className="flex flex-col gap-0.5">
            <span className="font-semibold text-slate-900 dark:text-white leading-none">{businessName}</span>
            <SlaBadge />
          </div>
        </div>
        <div className="flex items-center gap-2">
          {rightExtra}
          <span
            className="hidden sm:flex items-center gap-1.5 text-xs text-slate-400 dark:text-slate-500"
            title={`This page automatically refreshes every ${Math.round(refreshRateMs / 1000)} seconds`}
          >
            <i className="fa-solid fa-rotate text-[10px]" />
            Auto-refreshes every {Math.round(refreshRateMs / 1000)}s
          </span>
          <DarkModeToggle initialDark={initialDark} />
          {isAdmin ? (
            <>
              <Link
                href="/admin"
                className="flex items-center justify-center h-8 w-8 bg-slate-100 dark:bg-slate-800/70 hover:bg-slate-200 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700/60 rounded-lg text-slate-500 dark:text-slate-400"
                title="Edit Configuration"
              >
                <i className="fa-solid fa-wrench text-xs" />
              </Link>
              <button
                type="button"
                onClick={onLogout}
                className="flex items-center gap-1.5 h-8 px-3 bg-slate-100 dark:bg-slate-800/70 hover:bg-red-50 dark:hover:bg-red-900/30 border border-slate-200 dark:border-slate-700/60 rounded-lg text-slate-500 dark:text-slate-400 hover:text-red-600 text-xs font-medium"
              >
                <i className="fa-solid fa-right-from-bracket text-xs" /> Logout
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={onLoginClick}
              className="flex items-center gap-1.5 h-8 px-3 bg-indigo-600 hover:bg-indigo-500 rounded-lg text-white text-xs font-medium"
            >
              <i className="fa-solid fa-right-to-bracket text-xs" /> Login
            </button>
          )}
        </div>
      </div>
    </nav>
  );
}
