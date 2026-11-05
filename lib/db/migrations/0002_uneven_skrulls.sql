CREATE TABLE `folders` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`parent_id` text,
	`status` text DEFAULT 'active' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`parent_id`) REFERENCES `folders`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `folders_parent_id_idx` ON `folders` (`parent_id`);--> statement-breakpoint
CREATE INDEX `folders_status_idx` ON `folders` (`status`);--> statement-breakpoint
ALTER TABLE `files` ADD `folder_id` text REFERENCES folders(id);--> statement-breakpoint
CREATE INDEX `files_folder_id_idx` ON `files` (`folder_id`);