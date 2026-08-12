CREATE TABLE `becas` (
	`id` int unsigned AUTO_INCREMENT NOT NULL,
	`slug` varchar(160) NOT NULL,
	`title` varchar(240) NOT NULL,
	`institution_id` int unsigned,
	`provider_name` varchar(200),
	`area_id` int unsigned,
	`type` enum('institucional','estatal','privada','internacional') NOT NULL,
	`coverage` enum('total','parcial','monto_fijo','sin_datos') NOT NULL DEFAULT 'sin_datos',
	`amount_pyg` bigint,
	`percentage` tinyint unsigned,
	`summary` varchar(320) NOT NULL,
	`details_md` text,
	`requirements_md` text,
	`apply_url` varchar(512),
	`source_url` varchar(512) NOT NULL,
	`deadline` date,
	`verified_at` timestamp,
	`verified_by_user_id` int unsigned,
	`status` enum('draft','published','archived') NOT NULL DEFAULT 'draft',
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `becas_id` PRIMARY KEY(`id`),
	CONSTRAINT `becas_slug_uq` UNIQUE(`slug`),
	CONSTRAINT `becas_amount_matches_coverage` CHECK((`becas`.`coverage` = 'monto_fijo' and `becas`.`amount_pyg` is not null and `becas`.`percentage` is null)
       or (`becas`.`coverage` = 'parcial' and `becas`.`percentage` between 1 and 99 and `becas`.`amount_pyg` is null)
       or (`becas`.`coverage` in ('total', 'sin_datos') and `becas`.`amount_pyg` is null and `becas`.`percentage` is null))
);
--> statement-breakpoint
ALTER TABLE `becas` ADD CONSTRAINT `becas_institution_id_institutions_id_fk` FOREIGN KEY (`institution_id`) REFERENCES `institutions`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `becas` ADD CONSTRAINT `becas_area_id_areas_id_fk` FOREIGN KEY (`area_id`) REFERENCES `areas`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `becas` ADD CONSTRAINT `becas_verified_by_user_id_users_id_fk` FOREIGN KEY (`verified_by_user_id`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `becas_status_deadline_idx` ON `becas` (`status`,`deadline`);--> statement-breakpoint
CREATE INDEX `becas_institution_idx` ON `becas` (`institution_id`);--> statement-breakpoint
CREATE INDEX `becas_area_idx` ON `becas` (`area_id`);