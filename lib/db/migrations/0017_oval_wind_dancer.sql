CREATE TABLE `site_outage_log` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`site_id` integer,
	`site_name` text NOT NULL,
	`went_down_at` integer NOT NULL,
	`came_up_at` integer NOT NULL,
	`duration_s` integer NOT NULL,
	FOREIGN KEY (`site_id`) REFERENCES `sites`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `site_status` (
	`site_id` integer PRIMARY KEY NOT NULL,
	`status` text,
	`went_down_at` integer,
	`last_down_at` integer,
	`last_down_duration_s` integer,
	`last_checked_at` integer,
	`down_notified` integer DEFAULT false NOT NULL,
	FOREIGN KEY (`site_id`) REFERENCES `sites`(`id`) ON UPDATE no action ON DELETE cascade
);
