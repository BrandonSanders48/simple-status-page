"use client";

import { useState } from "react";
import Skeleton from "./Skeleton";
import type { RssCardPayload } from "@/lib/rssCache";

const HIGH_WORDS = ["error", "errors", "problem", "problems", "issue", "issues", "outage", "outages", "critical", "fault", "down", "failure", "failures", "disruption", "disruptions", "major"];
const MEDIUM_WORDS = ["maintenance", "than normal", "unavailable", "inaccessible", "difficulty", "difficulties", "slow", "slowness", "trouble", "degraded", "delay", "delays", "partial", "unstable", "intermittent"];
const GOOD_WORDS = ["fixed", "resolved", "restored", "recovery", "recovered", "operational", "normal", "stable"];

function sentimentClasses(text: string): string {
  const lower = text.toLowerCase();
  // Resolution words win first: a real update like "RESOLVED: ...was experiencing
  // issues..." should read as resolved (green), not get outranked by "issues" still
  // being present in the recap text.
  if (GOOD_WORDS.some((w) => lower.includes(w))) return "bg-emerald-50 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-200";
  if (HIGH_WORDS.some((w) => lower.includes(w))) return "bg-red-50 dark:bg-red-500/20 text-red-700 dark:text-red-200";
  if (MEDIUM_WORDS.some((w) => lower.includes(w))) return "bg-amber-50 dark:bg-amber-500/20 text-amber-700 dark:text-amber-200";
  return "bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300";
}

export default function RssPanel({ feeds, loading }: { feeds: RssCardPayload[]; loading: boolean }) {
  const [openIdx, setOpenIdx] = useState<number | null>(null);
  if (!loading && feeds.length === 0) return null;
  const active = openIdx !== null ? feeds[openIdx] : null;

  return (
    <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-sm p-5">
      <h5 className="flex items-center gap-2 text-base font-semibold text-slate-800 dark:text-slate-200 mb-4">
        <i className="fa-solid fa-circle-exclamation text-amber-500" /> Notices
      </h5>
      {loading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="rounded-xl p-3 flex flex-col justify-center gap-1.5 min-h-[80px] bg-slate-100 dark:bg-slate-700">
              <Skeleton className="h-3 w-1/2 mx-auto" />
              <Skeleton className="h-2.5 w-full" />
              <Skeleton className="h-2.5 w-3/4 mx-auto" />
            </div>
          ))}
        </div>
      ) : (
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-3">
        {feeds.map((feed, idx) => {
          const short = feed.item.length > 75 ? feed.item.slice(0, 72) + "..." : feed.item;
          return (
            <button
              key={idx}
              type="button"
              onClick={() => setOpenIdx(idx)}
              className={`rounded-xl p-3 text-center flex flex-col justify-center gap-1 min-h-[80px] text-left ${sentimentClasses(feed.item)}`}
            >
              <h6 className="font-semibold text-xs leading-tight text-center">{feed.name}</h6>
              <p className="text-xs leading-snug opacity-90 text-center">{short}</p>
            </button>
          );
        })}
      </div>
      )}

      {active && (
        <div
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setOpenIdx(null)}
        >
          <div
            className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-lg p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h5 className="text-base font-semibold flex items-center gap-2 text-slate-800 dark:text-slate-100">
                <i className="fa-solid fa-rss text-orange-500" /> {active.name}
              </h5>
              <button type="button" onClick={() => setOpenIdx(null)} className="text-slate-400 hover:text-slate-600 text-2xl leading-none">
                &times;
              </button>
            </div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Latest Item</p>
            <p className="text-sm text-slate-800 dark:text-slate-200 mb-3 whitespace-pre-line">{active.item}</p>
            {active.desc && (
              <>
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Description</p>
                <p className="text-sm text-slate-700 dark:text-slate-300 mb-3">{active.desc}</p>
              </>
            )}
            <a href={active.link} target="_blank" rel="noopener" className="text-sm text-blue-600 dark:text-blue-400 hover:underline">
              View Source →
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
