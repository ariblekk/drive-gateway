ALTER TABLE `google_accounts` RENAME TO `storage_accounts`;--> statement-breakpoint
DROP INDEX IF EXISTS `google_accounts_email_unique`;--> statement-breakpoint
DROP INDEX IF EXISTS `google_accounts_status_idx`;--> statement-breakpoint
DROP INDEX IF EXISTS `google_accounts_provider_idx`;--> statement-breakpoint
CREATE UNIQUE INDEX `storage_accounts_email_unique` ON `storage_accounts` (`email`);--> statement-breakpoint
CREATE INDEX `storage_accounts_status_idx` ON `storage_accounts` (`status`);--> statement-breakpoint
CREATE INDEX `storage_accounts_provider_idx` ON `storage_accounts` (`provider`);
