CREATE TABLE `email_digest_deliveries` (
	`id` text PRIMARY KEY NOT NULL,
	`recipient_user_id` text NOT NULL,
	`recipient_email` text NOT NULL,
	`digest_date` text NOT NULL,
	`period_start` text NOT NULL,
	`period_end` text NOT NULL,
	`item_count` integer DEFAULT 0 NOT NULL,
	`created_item_count` integer DEFAULT 0 NOT NULL,
	`status_change_count` integer DEFAULT 0 NOT NULL,
	`assignment_count` integer DEFAULT 0 NOT NULL,
	`type_change_count` integer DEFAULT 0 NOT NULL,
	`status_transitions` text DEFAULT '{}' NOT NULL,
	`message_id` text,
	`sent_at` text NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`recipient_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_email_digest_user_date_unique` ON `email_digest_deliveries` (`recipient_user_id`,`digest_date`);
--> statement-breakpoint
CREATE INDEX `idx_email_digest_date` ON `email_digest_deliveries` (`digest_date`);
