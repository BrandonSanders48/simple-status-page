CREATE TABLE `integration_ignored_items` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`target_id` integer NOT NULL,
	`item_key` text NOT NULL,
	`ignored_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`target_id`) REFERENCES `integration_targets`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uniq_integration_target_item` ON `integration_ignored_items` (`target_id`,`item_key`);