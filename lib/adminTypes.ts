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

/** Unlike the other target rows, `config` is exposed here as a parsed object -- the DB
 * stores it as a JSON string (see lib/db/schema.ts), serialized/deserialized at the
 * lib/adminConfig.ts boundary so the admin UI can bind to individual fields directly. */
export interface IntegrationTargetRow {
  id: number;
  integration: string;
  name: string;
  config: Record<string, string>;
  enabled: boolean;
  sortOrder: number;
}

export interface FullConfig {
  settings: SettingsRow;
  services: ServiceRow[];
  rssFeeds: RssFeedRow[];
  ispMap: IspMapRow[];
  statusCategories: StatusCategoryRow[];
  powerstoreTargets: PowerstoreTargetRow[];
  proxmoxTargets: ProxmoxTargetRow[];
  pbsTargets: PbsTargetRow[];
  integrationTargets: IntegrationTargetRow[];
}

/** A service row being edited in the admin UI; new, unsaved rows have no id yet. */
export type DraftService = Omit<ServiceRow, "id" | "createdAt"> & { id?: number };

/** A target row being edited in the admin UI; new, unsaved rows have no id yet. */
export type DraftPowerstoreTarget = Omit<PowerstoreTargetRow, "id"> & { id?: number };
export type DraftProxmoxTarget = Omit<ProxmoxTargetRow, "id"> & { id?: number };
export type DraftPbsTarget = Omit<PbsTargetRow, "id"> & { id?: number };
export type DraftIntegrationTarget = Omit<IntegrationTargetRow, "id"> & { id?: number };
