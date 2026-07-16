import type { settings, services, rssFeeds, ispMapEntries, statusCategories } from "./db/schema";

export type SettingsRow = typeof settings.$inferSelect;
export type ServiceRow = typeof services.$inferSelect;
export type RssFeedRow = typeof rssFeeds.$inferSelect;
export type IspMapRow = typeof ispMapEntries.$inferSelect;
export type StatusCategoryRow = typeof statusCategories.$inferSelect;

export interface FullConfig {
  settings: SettingsRow;
  services: ServiceRow[];
  rssFeeds: RssFeedRow[];
  ispMap: IspMapRow[];
  statusCategories: StatusCategoryRow[];
}

/** A service row being edited in the admin UI; new, unsaved rows have no id yet. */
export type DraftService = Omit<ServiceRow, "id" | "createdAt"> & { id?: number };

