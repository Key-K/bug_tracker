CREATE TABLE `error_groups` (
  `id` text PRIMARY KEY NOT NULL,
  `project_id` text NOT NULL REFERENCES `projects`(`id`) ON DELETE cascade,
  `source` text NOT NULL,
  `fingerprint` text NOT NULL,
  `environment` text NOT NULL,
  `service` text NOT NULL,
  `route_template` text,
  `method` text,
  `upstream_service` text,
  `error_type` text NOT NULL,
  `status_code` integer,
  `status_class` text,
  `severity` text NOT NULL DEFAULT 'warning',
  `state` text NOT NULL DEFAULT 'active',
  `occurrence_count` integer NOT NULL DEFAULT 1,
  `first_seen_at` text NOT NULL,
  `last_seen_at` text NOT NULL,
  `linked_item_id` text REFERENCES `scout_items`(`id`) ON DELETE set null,
  `ignored_until` text,
  `ignore_reason` text,
  `sample_request_id` text,
  `sample_trace_id` text,
  `grafana_logs_url` text,
  `grafana_trace_url` text,
  `sample_payload` text,
  `last_release` text,
  `last_regression_at` text,
  `created_at` text NOT NULL DEFAULT (datetime('now')),
  `updated_at` text NOT NULL DEFAULT (datetime('now'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_error_groups_project_env_fingerprint_unique` ON `error_groups` (`project_id`, `environment`, `fingerprint`);
--> statement-breakpoint
CREATE INDEX `idx_error_groups_project_state` ON `error_groups` (`project_id`, `state`);
--> statement-breakpoint
CREATE INDEX `idx_error_groups_project_service` ON `error_groups` (`project_id`, `service`);
--> statement-breakpoint
CREATE INDEX `idx_error_groups_linked_item` ON `error_groups` (`linked_item_id`);
--> statement-breakpoint
CREATE TABLE `error_group_occurrences` (
  `id` text PRIMARY KEY NOT NULL,
  `error_group_id` text NOT NULL REFERENCES `error_groups`(`id`) ON DELETE cascade,
  `occurred_at` text NOT NULL,
  `request_id` text,
  `trace_id` text,
  `status_code` integer,
  `sample_payload` text,
  `created_at` text NOT NULL DEFAULT (datetime('now'))
);
--> statement-breakpoint
CREATE INDEX `idx_error_occurrences_group_created` ON `error_group_occurrences` (`error_group_id`, `created_at`);
--> statement-breakpoint
CREATE TABLE `scout_bridge_jobs` (
  `id` text PRIMARY KEY NOT NULL,
  `event_id` text NOT NULL,
  `source` text NOT NULL DEFAULT 'alertmanager',
  `status` text NOT NULL DEFAULT 'pending',
  `attempts` integer NOT NULL DEFAULT 0,
  `next_attempt_at` text NOT NULL,
  `processing_started_at` text,
  `last_error` text,
  `payload` text NOT NULL,
  `created_at` text NOT NULL DEFAULT (datetime('now')),
  `updated_at` text NOT NULL DEFAULT (datetime('now'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_scout_bridge_jobs_event_unique` ON `scout_bridge_jobs` (`event_id`);
--> statement-breakpoint
CREATE INDEX `idx_scout_bridge_jobs_status_next` ON `scout_bridge_jobs` (`status`, `next_attempt_at`);
