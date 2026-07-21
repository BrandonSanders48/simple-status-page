CREATE TABLE `integration_phone_subscriptions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`phone` text NOT NULL,
	`target_id` integer NOT NULL,
	`subscribed_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`target_id`) REFERENCES `integration_targets`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uniq_phone_target` ON `integration_phone_subscriptions` (`phone`,`target_id`);--> statement-breakpoint
CREATE TABLE `phone_subscriptions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`phone` text NOT NULL,
	`service_id` integer NOT NULL,
	`subscribed_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`service_id`) REFERENCES `services`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uniq_phone_service` ON `phone_subscriptions` (`phone`,`service_id`);--> statement-breakpoint
CREATE TABLE `site_phone_subscriptions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`phone` text NOT NULL,
	`site_id` integer NOT NULL,
	`subscribed_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`site_id`) REFERENCES `sites`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uniq_phone_site` ON `site_phone_subscriptions` (`phone`,`site_id`);