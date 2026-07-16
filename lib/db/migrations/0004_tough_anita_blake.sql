CREATE TABLE `powerstore_targets` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`host` text NOT NULL,
	`username` text NOT NULL,
	`password` text NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `proxmox_targets` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`host` text NOT NULL,
	`token_id` text NOT NULL,
	`token_secret` text NOT NULL,
	`storage_id` text,
	`enabled` integer DEFAULT true NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
INSERT INTO `powerstore_targets` (`name`, `host`, `username`, `password`, `enabled`, `sort_order`)
SELECT 'Main Site', `powerstore_host`, `powerstore_username`, `powerstore_password`, 1, 0
FROM `settings`
WHERE `powerstore_host` IS NOT NULL AND `powerstore_username` IS NOT NULL AND `powerstore_password` IS NOT NULL;
--> statement-breakpoint
INSERT INTO `proxmox_targets` (`name`, `host`, `token_id`, `token_secret`, `storage_id`, `enabled`, `sort_order`)
SELECT 'Main Site', `proxmox_host`, `proxmox_token_id`, `proxmox_token_secret`, `proxmox_storage_id`, 1, 0
FROM `settings`
WHERE `proxmox_host` IS NOT NULL AND `proxmox_token_id` IS NOT NULL AND `proxmox_token_secret` IS NOT NULL;
--> statement-breakpoint
ALTER TABLE `settings` DROP COLUMN `powerstore_host`;--> statement-breakpoint
ALTER TABLE `settings` DROP COLUMN `powerstore_username`;--> statement-breakpoint
ALTER TABLE `settings` DROP COLUMN `powerstore_password`;--> statement-breakpoint
ALTER TABLE `settings` DROP COLUMN `proxmox_host`;--> statement-breakpoint
ALTER TABLE `settings` DROP COLUMN `proxmox_token_id`;--> statement-breakpoint
ALTER TABLE `settings` DROP COLUMN `proxmox_token_secret`;--> statement-breakpoint
ALTER TABLE `settings` DROP COLUMN `proxmox_storage_id`;