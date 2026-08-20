CREATE INDEX `activity_log_created_idx` ON `activity_log` (`created_at`);--> statement-breakpoint
CREATE INDEX `activity_log_entity_created_idx` ON `activity_log` (`entity_type`,`created_at`);