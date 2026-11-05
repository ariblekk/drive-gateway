ALTER TABLE `files` ADD `s3_credential_id` text;--> statement-breakpoint
CREATE INDEX `files_s3_cred_idx` ON `files` (`s3_credential_id`,`status`);--> statement-breakpoint
ALTER TABLE `s3_credentials` ADD `bucket_id` text DEFAULT '*' NOT NULL;--> statement-breakpoint
ALTER TABLE `s3_credentials` ADD `permission` text DEFAULT 'read-write' NOT NULL;--> statement-breakpoint
ALTER TABLE `s3_credentials` ADD `max_storage_bytes` integer;