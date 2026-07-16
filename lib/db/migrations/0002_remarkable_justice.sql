ALTER TABLE `settings` ADD `storage_integration_enabled` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `settings` ADD `powerstore_host` text;--> statement-breakpoint
ALTER TABLE `settings` ADD `powerstore_username` text;--> statement-breakpoint
ALTER TABLE `settings` ADD `powerstore_password` text;--> statement-breakpoint
ALTER TABLE `settings` ADD `proxmox_host` text;--> statement-breakpoint
ALTER TABLE `settings` ADD `proxmox_token_id` text;--> statement-breakpoint
ALTER TABLE `settings` ADD `proxmox_token_secret` text;--> statement-breakpoint
ALTER TABLE `settings` ADD `proxmox_storage_id` text;