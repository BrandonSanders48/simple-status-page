CREATE TABLE `email_tokens` (
	`token` text PRIMARY KEY NOT NULL,
	`service_id` integer,
	`service_name` text NOT NULL,
	`action` text NOT NULL,
	`expires_at` integer NOT NULL,
	FOREIGN KEY (`service_id`) REFERENCES `services`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `incidents` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`title` text NOT NULL,
	`description` text,
	`severity` text NOT NULL,
	`start_time` text NOT NULL,
	`end_time` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `isp_map_entries` (
	`ip` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `maintenance_windows` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`title` text,
	`start_time` text,
	`end_time` text,
	`description` text
);
--> statement-breakpoint
CREATE TABLE `outage_log` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`service_id` integer,
	`service_name` text NOT NULL,
	`went_down_at` integer NOT NULL,
	`came_up_at` integer NOT NULL,
	`duration_s` integer NOT NULL,
	FOREIGN KEY (`service_id`) REFERENCES `services`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `rate_limit_hits` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`key` text NOT NULL,
	`ts` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `rss_feeds` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`host` text NOT NULL,
	`tag` text DEFAULT 'item' NOT NULL,
	`description` text,
	`sort_order` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `service_status` (
	`service_id` integer PRIMARY KEY NOT NULL,
	`status` text,
	`went_down_at` integer,
	`last_down_at` integer,
	`last_down_duration_s` integer,
	`last_checked_at` integer,
	FOREIGN KEY (`service_id`) REFERENCES `services`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `services` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`host` text NOT NULL,
	`port` integer,
	`type` text DEFAULT 'tcp' NOT NULL,
	`description` text,
	`visible` integer DEFAULT true NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `settings` (
	`id` integer PRIMARY KEY NOT NULL,
	`business_name` text DEFAULT 'Status Page' NOT NULL,
	`business_logo_path` text,
	`company_url` text,
	`support_email` text,
	`support_phone` text,
	`footer_message` text,
	`announcement_banner` text,
	`announcement_type` text DEFAULT 'info' NOT NULL,
	`theme_primary_color` text DEFAULT '#4f46e5' NOT NULL,
	`theme_accent_color` text DEFAULT '#06b6d4' NOT NULL,
	`theme_success_color` text DEFAULT '#059669' NOT NULL,
	`theme_warning_color` text DEFAULT '#d97706' NOT NULL,
	`theme_error_color` text DEFAULT '#dc2626' NOT NULL,
	`sla_enabled` integer DEFAULT false NOT NULL,
	`sla_uptime_target` real DEFAULT 99.9 NOT NULL,
	`sla_reporting_period` text DEFAULT 'monthly' NOT NULL,
	`meta_description` text,
	`meta_author` text,
	`config_version` text DEFAULT '1.0.0' NOT NULL,
	`refresh_rate_ms` integer DEFAULT 12000 NOT NULL,
	`alert_sound` integer DEFAULT false NOT NULL,
	`browser_notify` integer DEFAULT true NOT NULL,
	`require_auth` integer DEFAULT true NOT NULL,
	`services_visible_count` integer DEFAULT 10 NOT NULL,
	`gateway_host` text,
	`public_dns_host` text DEFAULT '8.8.8.8',
	`internal_domain` text,
	`email_from` text,
	`email_reply_to` text,
	`smtp_host` text,
	`smtp_port` integer DEFAULT 587,
	`smtp_secure` text DEFAULT 'tls',
	`smtp_username` text,
	`smtp_password` text,
	`smtp_show_action_buttons` integer DEFAULT true NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `status_categories` (
	`key` text PRIMARY KEY NOT NULL,
	`label` text NOT NULL,
	`color` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `subscriptions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`email` text NOT NULL,
	`service_id` integer NOT NULL,
	`subscribed_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`service_id`) REFERENCES `services`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uniq_email_service` ON `subscriptions` (`email`,`service_id`);