"use client";

import { useState } from "react";
import ServiceCard from "./ServiceCard";
import Skeleton from "./Skeleton";
import type { StatusServicePayload, SitePayload } from "@/lib/statusCache";

interface DayUptime {
  date: string;
  upPercent: number | null;
}

interface Props {
  services: StatusServicePayload[];
  visibleCount: number;
  loading: boolean;
  onOpenOutageLog: () => void;
  uptimeByService?: Record<number, DayUptime[]>;
  /** When any service is assigned to a site, services are grouped under a header per
   * site (with its own tunnel Up/Down pill, if that site has a tunnelHost configured)
   * instead of one flat grid - so a site-wide link outage reads differently from a
   * single service failing on its own. Falls back to today's flat grid untouched when
   * no sites exist or nothing's assigned to one. */
  sites?: SitePayload[];
  /** Settings > Sites toggle - off keeps every service in one flat grid regardless
   * of site assignment, for admins who want Sites purely as an organizational tool
   * without changing what visitors see. Defaults true (today's grouped behavior). */
  groupBySite?: boolean;
  /** Skips this panel's own card chrome (background/border/shadow/padding) - used
   * when it's rendered as a tab's content inside ServiceTabs, which already provides
   * that chrome via its enclosing panel. */
  bare?: boolean;
}

/** True unless a site has a tunnelHost configured and its check failed - same
 * "invisible when off" fold-in as isStorageHealthy/isPbsAllHealthy: a site that's
 * just a grouping label (no tunnelHost) never affects the overall banner. */
export function isSitesAllHealthy(sites: SitePayload[]): boolean {
  return sites.every((s) => s.tunnelOk !== false);
}

function TunnelPill({ ok }: { ok: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full ${
        ok
          ? "bg-emerald-50 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300"
          : "bg-red-50 dark:bg-red-500/20 text-red-700 dark:text-red-300"
      }`}
    >
      <span className="w-1.5 h-1.5 rounded-full bg-current" /> Tunnel {ok ? "Up" : "Down"}
    </span>
  );
}

function ServiceGrid({ services, uptimeByService }: { services: StatusServicePayload[]; uptimeByService?: Record<number, DayUptime[]> }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-3">
      {services.map((s) => (
        <ServiceCard key={s.id} service={s} uptime={uptimeByService?.[s.id]} />
      ))}
    </div>
  );
}

function ServiceCardSkeleton() {
  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-600/60 bg-white dark:bg-slate-700 p-3">
      <div className="flex items-start justify-between gap-1.5 mb-2">
        <Skeleton className="h-3 w-3/4" />
        <Skeleton className="h-3 w-10 rounded-full flex-shrink-0" />
      </div>
      <Skeleton className="h-4 w-14 rounded-full" />
      <Skeleton className="h-2.5 w-full mt-2" />
    </div>
  );
}

export default function ServicesPanel({
  services,
  visibleCount,
  loading,
  onOpenOutageLog,
  uptimeByService,
  sites = [],
  groupBySite = true,
  bare = false,
}: Props) {
  const [expanded, setExpanded] = useState(false);
  const shown = expanded ? services : services.slice(0, visibleCount);
  const hiddenCount = services.length - visibleCount;

  const siteById = new Map(sites.map((s) => [s.id, s]));
  const grouped = new Map<number, StatusServicePayload[]>();
  const ungrouped: StatusServicePayload[] = [];
  for (const s of services) {
    if (s.siteId !== null && siteById.has(s.siteId)) {
      const list = grouped.get(s.siteId) ?? [];
      list.push(s);
      grouped.set(s.siteId, list);
    } else {
      ungrouped.push(s);
    }
  }
  // Falls back to the plain flat grid below when no service is actually assigned to
  // a site yet (even if sites themselves have been created), or when the admin has
  // turned grouping off entirely via Settings > Sites.
  const useGrouping = groupBySite && grouped.size > 0;

  const content = (
    <>
      <div className="flex items-center justify-end mb-4">
        <button
          type="button"
          onClick={onOpenOutageLog}
          className="flex items-center gap-1.5 text-xs font-medium text-slate-500 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors px-2.5 py-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700/50"
        >
          <i className="fa-solid fa-clock-rotate-left text-[11px]" /> Outage History
        </button>
      </div>
      {loading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <ServiceCardSkeleton key={i} />
          ))}
        </div>
      ) : services.length === 0 ? (
        <p className="text-sm text-slate-400 dark:text-slate-500 text-center py-6">No services configured.</p>
      ) : useGrouping ? (
        <div className="space-y-5">
          {sites
            .filter((site) => (grouped.get(site.id)?.length ?? 0) > 0)
            .map((site) => (
              <div key={site.id}>
                <div className="flex items-center gap-2 mb-2.5">
                  <h4 className="text-sm font-semibold text-slate-700 dark:text-slate-200">{site.name}</h4>
                  {site.tunnelOk !== null && <TunnelPill ok={site.tunnelOk} />}
                </div>
                <ServiceGrid services={grouped.get(site.id)!} uptimeByService={uptimeByService} />
              </div>
            ))}
          {ungrouped.length > 0 && (
            <div>
              <h4 className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-2.5">Other Services</h4>
              <ServiceGrid services={ungrouped} uptimeByService={uptimeByService} />
            </div>
          )}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-3">
            {shown.map((s) => (
              <ServiceCard key={s.id} service={s} uptime={uptimeByService?.[s.id]} />
            ))}
          </div>
          {hiddenCount > 0 && (
            <div className="mt-3 text-center">
              <button
                type="button"
                onClick={() => setExpanded((v) => !v)}
                className="text-xs font-medium text-slate-500 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors px-3 py-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700/50 inline-flex items-center gap-1.5"
              >
                <i className={`fa-solid ${expanded ? "fa-chevron-up" : "fa-chevron-down"} text-[10px]`} />
                {expanded ? "Show less" : `Show ${hiddenCount} more`}
              </button>
            </div>
          )}
        </>
      )}
    </>
  );

  if (bare) return content;

  return <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-sm p-5 mb-5">{content}</div>;
}
