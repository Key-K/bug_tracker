CREATE TABLE IF NOT EXISTS `scout_item_links` (
	`id` text PRIMARY KEY NOT NULL,
	`source_item_id` text NOT NULL,
	`target_item_id` text NOT NULL,
	`type` text DEFAULT 'related' NOT NULL,
	`created_by_id` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`source_item_id`) REFERENCES `scout_items`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`target_item_id`) REFERENCES `scout_items`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_item_links_source` ON `scout_item_links` (`source_item_id`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_item_links_target` ON `scout_item_links` (`target_item_id`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_item_links_source_target_type` ON `scout_item_links` (`source_item_id`,`target_item_id`,`type`);
