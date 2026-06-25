CREATE TABLE `issue_triage_state` (
	`repo` text NOT NULL,
	`issue_number` integer NOT NULL,
	`turn_id` text NOT NULL,
	`created_at` integer NOT NULL,
	`event_action` text NOT NULL,
	`body_hash` text NOT NULL,
	`labels_applied` text NOT NULL,
	`comment_id` integer,
	`comment_hash` text,
	`closed_at` integer,
	PRIMARY KEY(`repo`, `issue_number`, `turn_id`)
);
--> statement-breakpoint
CREATE INDEX `idx_state_issue` ON `issue_triage_state` (`repo`,`issue_number`,`created_at`);--> statement-breakpoint
CREATE TABLE `triage_config` (
	`repo` text PRIMARY KEY NOT NULL,
	`config_yaml` text NOT NULL,
	`material_threshold` real DEFAULT 0.2 NOT NULL,
	`triggers_enabled` text NOT NULL,
	`loaded_at` integer NOT NULL
);
