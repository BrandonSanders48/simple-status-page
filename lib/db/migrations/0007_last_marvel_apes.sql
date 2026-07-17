ALTER TABLE `powerstore_targets` ADD `is_dr` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `proxmox_targets` ADD `is_dr` integer DEFAULT false NOT NULL;