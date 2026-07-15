ALTER TABLE `service_status` ADD `down_notified` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `settings` ADD `notify_down_after_minutes` integer DEFAULT 3 NOT NULL;