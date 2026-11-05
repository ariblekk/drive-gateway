CREATE TABLE `activity_log` (
	`id` text PRIMARY KEY NOT NULL,
	`action` text NOT NULL,
	`file_id` text,
	`account_id` text,
	`api_key_id` text,
	`bytes` integer,
	`status` text DEFAULT 'ok' NOT NULL,
	`message` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `activity_log_created_at_idx` ON `activity_log` (`created_at`);--> statement-breakpoint
CREATE TABLE `api_keys` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`key_hash` text NOT NULL,
	`key_prefix` text NOT NULL,
	`last_used_at` integer,
	`revoked_at` integer,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `api_keys_key_hash_unique` ON `api_keys` (`key_hash`);--> statement-breakpoint
CREATE TABLE `files` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`drive_file_id` text NOT NULL,
	`name` text NOT NULL,
	`mime_type` text,
	`size` integer NOT NULL,
	`path` text DEFAULT '/' NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `google_accounts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `files_account_id_idx` ON `files` (`account_id`);--> statement-breakpoint
CREATE INDEX `files_status_idx` ON `files` (`status`);--> statement-breakpoint
CREATE TABLE `google_accounts` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`display_name` text,
	`picture_url` text,
	`refresh_token` text NOT NULL,
	`access_token` text,
	`token_expiry` integer,
	`scope` text,
	`quota_limit` integer,
	`quota_usage` integer DEFAULT 0 NOT NULL,
	`quota_usage_in_drive` integer DEFAULT 0 NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`last_error` text,
	`last_used_at` integer,
	`last_quota_sync` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `google_accounts_email_unique` ON `google_accounts` (`email`);--> statement-breakpoint
CREATE INDEX `google_accounts_status_idx` ON `google_accounts` (`status`);