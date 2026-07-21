CREATE TABLE `integration_health_status` (
	`target_id` integer PRIMARY KEY NOT NULL,
	`healthy` integer,
	`went_unhealthy_at` integer,
	`last_unhealthy_at` integer,
	`last_unhealthy_duration_s` integer,
	`last_checked_at` integer,
	`down_notified` integer DEFAULT false NOT NULL,
	FOREIGN KEY (`target_id`) REFERENCES `integration_targets`(`id`) ON UPDATE no action ON DELETE cascade
);
