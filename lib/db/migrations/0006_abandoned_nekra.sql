ALTER TABLE `google_accounts` ADD `provider` text DEFAULT 'google' NOT NULL;--> statement-breakpoint
ALTER TABLE `google_accounts` ADD `s3_endpoint` text;--> statement-breakpoint
ALTER TABLE `google_accounts` ADD `s3_bucket` text;--> statement-breakpoint
ALTER TABLE `google_accounts` ADD `s3_region` text DEFAULT 'us-east-1';--> statement-breakpoint
ALTER TABLE `google_accounts` ADD `s3_access_key_id` text;--> statement-breakpoint
ALTER TABLE `google_accounts` ADD `s3_secret_ciphertext` text;--> statement-breakpoint
ALTER TABLE `google_accounts` ADD `s3_force_path_style` integer DEFAULT 1;--> statement-breakpoint
CREATE INDEX `google_accounts_provider_idx` ON `google_accounts` (`provider`);
