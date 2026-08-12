CREATE TABLE `job_postings` (
	`id` int unsigned AUTO_INCREMENT NOT NULL,
	`career_id` int unsigned NOT NULL,
	`title` varchar(240) NOT NULL,
	`employer_name` varchar(200) NOT NULL,
	`location_label` varchar(160),
	`url` varchar(512) NOT NULL,
	`source` enum('manual','trabajo_com_py','empleos_com_py','institucion','otra') NOT NULL DEFAULT 'manual',
	`source_label` varchar(120) NOT NULL,
	`posted_on` date NOT NULL,
	`expires_on` date,
	`summary` varchar(320),
	`status` enum('draft','published','archived') NOT NULL DEFAULT 'published',
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `job_postings_id` PRIMARY KEY(`id`),
	CONSTRAINT `job_postings_url_uq` UNIQUE(`url`)
);
--> statement-breakpoint
ALTER TABLE `job_postings` ADD CONSTRAINT `job_postings_career_id_careers_id_fk` FOREIGN KEY (`career_id`) REFERENCES `careers`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `job_postings_career_posted_idx` ON `job_postings` (`career_id`,`posted_on`);--> statement-breakpoint
CREATE INDEX `job_postings_status_expires_idx` ON `job_postings` (`status`,`expires_on`);