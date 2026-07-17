CREATE TABLE `pbs_targets` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`host` text NOT NULL,
	`token_id` text NOT NULL,
	`token_secret` text NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL
);
