PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_s3_credentials` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`access_key_id` text NOT NULL,
	`secret_ciphertext` text NOT NULL,
	`bucket_id` text NOT NULL,
	`permission` text DEFAULT 'read-write' NOT NULL,
	`max_storage_bytes` integer,
	`status` text DEFAULT 'active' NOT NULL,
	`last_used_at` integer,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
INSERT INTO `__new_s3_credentials`("id", "name", "access_key_id", "secret_ciphertext", "bucket_id", "permission", "max_storage_bytes", "status", "last_used_at", "created_at") SELECT "id", "name", "access_key_id", "secret_ciphertext", "bucket_id", "permission", "max_storage_bytes", "status", "last_used_at", "created_at" FROM `s3_credentials`;--> statement-breakpoint
DROP TABLE `s3_credentials`;--> statement-breakpoint
ALTER TABLE `__new_s3_credentials` RENAME TO `s3_credentials`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
UPDATE `s3_credentials` SET `status` = 'disabled' WHERE `bucket_id` = '*';--> statement-breakpoint
CREATE UNIQUE INDEX `s3_credentials_access_key_id_unique` ON `s3_credentials` (`access_key_id`);