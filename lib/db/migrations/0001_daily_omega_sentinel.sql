CREATE TABLE `type_usage` (
	`account_id` text PRIMARY KEY NOT NULL,
	`photos_bytes` integer DEFAULT 0 NOT NULL,
	`photos_count` integer DEFAULT 0 NOT NULL,
	`videos_bytes` integer DEFAULT 0 NOT NULL,
	`videos_count` integer DEFAULT 0 NOT NULL,
	`documents_bytes` integer DEFAULT 0 NOT NULL,
	`documents_count` integer DEFAULT 0 NOT NULL,
	`other_bytes` integer DEFAULT 0 NOT NULL,
	`other_count` integer DEFAULT 0 NOT NULL,
	`synced_at` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `google_accounts`(`id`) ON UPDATE no action ON DELETE no action
);
