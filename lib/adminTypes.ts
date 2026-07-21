import type { settings, services, rssFeeds, ispMapEntries, statusCategories, sites } from "./db/schema";

export type SettingsRow = typeof settings.$inferSelect;
export type ServiceRow = typeof services.$inferSelect;
export type RssFeedRow = typeof rssFeeds.$inferSelect;
export type IspMapRow = typeof ispMapEntries.$inferSelect;
export type StatusCategoryRow = typeof statusCategories.$inferSelect;
export type SiteRow = typeof sites.$inferSelect;

/** Unlike other rows, `config` is exposed here as a parsed object -- the DB stores it
 * as a JSON string (see lib/db/schema.ts), serialized/deserialized at the
 * lib/adminConfig.ts boundary so the admin UI can bind to individual fields directly.
 * Every monitored external system -- PowerStore, Proxmox, PBS, and marketplace
 * integrations alike -- is one of these rows, distinguished by `integration`.
 * `isDr` only means anything for powerstore/proxmox (it feeds the Failover tab). */
export interface IntegrationTargetRow {
  id: number;
  integration: string;
  name: string;
  config: Record<string, string>;
  enabled: boolean;
  isDr: boolean;
  sortOrder: number;
}

export interface FullConfig {
  settings: SettingsRow;
  services: ServiceRow[];
  rssFeeds: RssFeedRow[];
  ispMap: IspMapRow[];
  statusCategories: StatusCategoryRow[];
  integrationTargets: IntegrationTargetRow[];
  sites: SiteRow[];
}

/** A service row being edited in the admin UI; new, unsaved rows have no id yet. */
export type DraftService = Omit<ServiceRow, "id" | "createdAt"> & { id?: number };

/** A site row being edited in the admin UI; new, unsaved rows have no id yet. */
export type DraftSite = Omit<SiteRow, "id"> & { id?: number };

/** A target row being edited in the admin UI; new, unsaved rows have no id yet. */
export type DraftIntegrationTarget = Omit<IntegrationTargetRow, "id"> & { id?: number };
