CREATE TABLE `buckets` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `buckets_name_unique` ON `buckets` (`name`);--> statement-breakpoint
CREATE TABLE `s3_credentials` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`access_key_id` text NOT NULL,
	`secret_ciphertext` text NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`last_used_at` integer,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `s3_credentials_access_key_id_unique` ON `s3_credentials` (`access_key_id`);--> statement-breakpoint
ALTER TABLE `files` ADD `bucket_id` text DEFAULT 'default' NOT NULL;--> statement-breakpoint
ALTER TABLE `files` ADD `key` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `files` ADD `etag` text;--> statement-breakpoint
ALTER TABLE `files` ADD `metadata` text;--> statement-breakpoint
CREATE INDEX `files_bucket_key_idx` ON `files` (`bucket_id`,`key`);--> statement-breakpoint
CREATE INDEX `files_bucket_key_status_idx` ON `files` (`bucket_id`,`key`,`status`);--> statement-breakpoint
INSERT INTO `buckets` (`id`, `name`, `created_at`) VALUES ('default', 'default', CAST(strftime('%s','now') AS INTEGER) * 1000);--> statement-breakpoint
UPDATE `files`
SET `key` = CASE
	WHEN `path` = '/' OR `path` = '' THEN `name`
	WHEN substr(`path`, 1, 1) = '/' THEN substr(`path`, 2) || '/' || `name`
	ELSE `path` || '/' || `name`
END;