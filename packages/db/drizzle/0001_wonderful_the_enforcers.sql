CREATE TABLE `recent_projects` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`project_id` text NOT NULL,
	`project_name` text NOT NULL,
	`opened_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `recent_projects_project_id_unique` ON `recent_projects` (`project_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `recent_projects_opened_at_unique` ON `recent_projects` (`opened_at`);