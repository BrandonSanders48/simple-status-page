ALTER TABLE `integration_targets` ADD `is_dr` integer DEFAULT false NOT NULL;--> statement-breakpoint
INSERT INTO `integration_targets` (`id`, `integration`, `name`, `config`, `enabled`, `is_dr`, `sort_order`)
SELECT `id` + 100000, 'powerstore', `name`, json_object('host', `host`, 'username', `username`, 'password', `password`), `enabled`, `is_dr`, `sort_order`
FROM `powerstore_targets`;--> statement-breakpoint
INSERT INTO `integration_targets` (`id`, `integration`, `name`, `config`, `enabled`, `is_dr`, `sort_order`)
SELECT `id` + 200000, 'proxmox', `name`, json_object('host', `host`, 'tokenId', `token_id`, 'tokenSecret', `token_secret`, 'storageId', COALESCE(`storage_id`, '')), `enabled`, `is_dr`, `sort_order`
FROM `proxmox_targets`;--> statement-breakpoint
INSERT INTO `integration_targets` (`id`, `integration`, `name`, `config`, `enabled`, `is_dr`, `sort_order`)
SELECT `id` + 300000, 'pbs', `name`, json_object('host', `host`, 'tokenId', `token_id`, 'tokenSecret', `token_secret`), `enabled`, false, `sort_order`
FROM `pbs_targets`;--> statement-breakpoint
UPDATE `pbs_acknowledged_tasks` SET `target_id` = `target_id` + 300000;--> statement-breakpoint
DROP TABLE `pbs_targets`;--> statement-breakpoint
DROP TABLE `powerstore_targets`;--> statement-breakpoint
DROP TABLE `proxmox_targets`;--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_pbs_acknowledged_tasks` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`target_id` integer NOT NULL,
	`task_id` text NOT NULL,
	`acknowledged_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`target_id`) REFERENCES `integration_targets`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_pbs_acknowledged_tasks`("id", "target_id", "task_id", "acknowledged_at") SELECT "id", "target_id", "task_id", "acknowledged_at" FROM `pbs_acknowledged_tasks`;--> statement-breakpoint
DROP TABLE `pbs_acknowledged_tasks`;--> statement-breakpoint
ALTER TABLE `__new_pbs_acknowledged_tasks` RENAME TO `pbs_acknowledged_tasks`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `uniq_pbs_target_task` ON `pbs_acknowledged_tasks` (`target_id`,`task_id`);
