ALTER TABLE `api_keys` ADD `purpose` text DEFAULT 'custom' NOT NULL;--> statement-breakpoint
ALTER TABLE `api_keys` ADD `scopes` text DEFAULT '["items:read","items:create","items:comment","items:workflow","items:triage","storage:read"]' NOT NULL;--> statement-breakpoint
ALTER TABLE `api_keys` ADD `revoked_at` text;--> statement-breakpoint
ALTER TABLE `projects` DROP COLUMN `autofix_enabled`;
