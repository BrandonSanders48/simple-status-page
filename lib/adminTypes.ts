import type {
  settings,
  services,
  rssFeeds,
  ispMapEntries,
  statusCategories,
  powerstoreTargets,
  proxmoxTargets,
  pbsTargets,
} from "./db/schema";

export type SettingsRow = typeof settings.$inferSelect;
export type ServiceRow = typeof services.$inferSelect;
export type RssFeedRow = typeof rssFeeds.$inferSelect;
export type IspMapRow = typeof ispMapEntries.$inferSelect;
export type StatusCategoryRow = typeof statusCategories.$inferSelect;
export type PowerstoreTargetRow = typeof powerstoreTargets.$inferSelect;
export type ProxmoxTargetRow = typeof proxmoxTargets.$inferSelect;
export type PbsTargetRow = typeof pbsTargets.$inferSelect;

export interface FullConfig {
  settings: SettingsRow;
  services: ServiceRow[];
  rssFeeds: RssFeedRow[];
  ispMap: IspMapRow[];
  statusCategories: StatusCategoryRow[];
  powerstoreTargets: PowerstoreTargetRow[];
  proxmoxTargets: ProxmoxTargetRow[];
  pbsTargets: PbsTargetRow[];
}

/** A service row being edited in the admin UI; new, unsaved rows have no id yet. */
export type DraftService = Omit<ServiceRow, "id" | "createdAt"> & { id?: number };

/** A target row being edited in the admin UI; new, unsaved rows have no id yet. */
export type DraftPowerstoreTarget = Omit<PowerstoreTargetRow, "id"> & { id?: number };
export type DraftProxmoxTarget = Omit<ProxmoxTargetRow, "id"> & { id?: number };
export type DraftPbsTarget = Omit<PbsTargetRow, "id"> & { id?: number };
