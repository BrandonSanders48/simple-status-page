CREATE TABLE `integration_targets` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`integration` text NOT NULL,
	`name` text NOT NULL,
	`config` text NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL
);
