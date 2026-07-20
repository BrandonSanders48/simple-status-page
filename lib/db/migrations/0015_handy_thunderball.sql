CREATE TABLE `network_test_log` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`host` text NOT NULL,
	`client_ip` text NOT NULL,
	`ok_count` integer NOT NULL,
	`fail_count` integer NOT NULL,
	`inconclusive_count` integer NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
