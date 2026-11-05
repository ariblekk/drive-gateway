ALTER TABLE `folders` ADD `bucket_id` text DEFAULT 'default' NOT NULL;--> statement-breakpoint
CREATE INDEX `folders_bucket_parent_idx` ON `folders` (`bucket_id`,`parent_id`);