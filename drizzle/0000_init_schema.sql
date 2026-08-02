CREATE TABLE `accreditations` (
	`id` int unsigned AUTO_INCREMENT NOT NULL,
	`scope` enum('institution','program','offering') NOT NULL,
	`institution_id` int unsigned,
	`program_id` int unsigned,
	`offering_id` int unsigned,
	`agency` enum('ANEAES','CONES','ARCUSUR','otra') NOT NULL,
	`kind` enum('acreditacion','habilitacion','en_proceso') NOT NULL,
	`status` enum('vigente','en_proceso','vencida','no_acreditada','sin_datos') NOT NULL DEFAULT 'sin_datos',
	`model` varchar(120),
	`resolution_number` varchar(120),
	`resolution_date` date,
	`valid_from` date,
	`valid_to` date,
	`source_url` varchar(512),
	`source_record_id` bigint unsigned,
	`is_disputed` boolean NOT NULL DEFAULT false,
	`verified_at` timestamp,
	`verified_by_user_id` int unsigned,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `accreditations_id` PRIMARY KEY(`id`),
	CONSTRAINT `accreditations_scope_target` CHECK((`accreditations`.`scope` = 'institution' and `accreditations`.`institution_id` is not null and `accreditations`.`program_id` is null and `accreditations`.`offering_id` is null)
       or (`accreditations`.`scope` = 'program' and `accreditations`.`program_id` is not null and `accreditations`.`offering_id` is null)
       or (`accreditations`.`scope` = 'offering' and `accreditations`.`offering_id` is not null)),
	CONSTRAINT `accreditations_citation_required` CHECK(`accreditations`.`status` not in ('vigente', 'en_proceso') or `accreditations`.`source_url` is not null or `accreditations`.`resolution_number` is not null)
);
--> statement-breakpoint
CREATE TABLE `activity_log` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`user_id` int unsigned,
	`entity_type` varchar(64) NOT NULL,
	`entity_id` int unsigned,
	`action` varchar(64) NOT NULL,
	`before_json` json,
	`after_json` json,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `activity_log_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `admissions` (
	`id` int unsigned AUTO_INCREMENT NOT NULL,
	`scope` enum('institution','program','offering') NOT NULL,
	`institution_id` int unsigned,
	`program_id` int unsigned,
	`offering_id` int unsigned,
	`period_label` varchar(160) NOT NULL,
	`registration_opens` date,
	`registration_closes` date,
	`exam_date` date,
	`classes_start` date,
	`requirements_md` text,
	`process_md` text,
	`url` varchar(512),
	`is_active` boolean NOT NULL DEFAULT true,
	`verified_at` timestamp,
	`verified_by_user_id` int unsigned,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `admissions_id` PRIMARY KEY(`id`),
	CONSTRAINT `admissions_scope_target` CHECK((`admissions`.`scope` = 'institution' and `admissions`.`institution_id` is not null and `admissions`.`program_id` is null and `admissions`.`offering_id` is null)
       or (`admissions`.`scope` = 'program' and `admissions`.`program_id` is not null and `admissions`.`offering_id` is null)
       or (`admissions`.`scope` = 'offering' and `admissions`.`offering_id` is not null)),
	CONSTRAINT `admissions_window_order` CHECK(`admissions`.`registration_opens` is null or `admissions`.`registration_closes` is null or `admissions`.`registration_closes` >= `admissions`.`registration_opens`)
);
--> statement-breakpoint
CREATE TABLE `areas` (
	`id` int unsigned AUTO_INCREMENT NOT NULL,
	`slug` varchar(128) NOT NULL,
	`name_es` varchar(160) NOT NULL,
	`description_md` text,
	`sort_order` smallint NOT NULL DEFAULT 0,
	`icon` varchar(64),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `areas_id` PRIMARY KEY(`id`),
	CONSTRAINT `areas_slug_uq` UNIQUE(`slug`)
);
--> statement-breakpoint
CREATE TABLE `campuses` (
	`id` int unsigned AUTO_INCREMENT NOT NULL,
	`institution_id` int unsigned NOT NULL,
	`name` varchar(200) NOT NULL,
	`slug` varchar(160) NOT NULL,
	`city_id` int unsigned NOT NULL,
	`address` varchar(320),
	`lat` decimal(10,7),
	`lng` decimal(10,7),
	`phone_e164` varchar(20),
	`is_main` boolean NOT NULL DEFAULT false,
	`status` enum('draft','published','archived') NOT NULL DEFAULT 'published',
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `campuses_id` PRIMARY KEY(`id`),
	CONSTRAINT `campuses_institution_slug_uq` UNIQUE(`institution_id`,`slug`)
);
--> statement-breakpoint
CREATE TABLE `careers` (
	`id` int unsigned AUTO_INCREMENT NOT NULL,
	`slug` varchar(128) NOT NULL,
	`name_es` varchar(200) NOT NULL,
	`area_id` int unsigned,
	`level_default` enum('tecnicatura','grado','especializacion','maestria','doctorado') NOT NULL DEFAULT 'grado',
	`synonyms_json` json,
	`description_md` text,
	`salida_laboral_md` text,
	`status` enum('draft','published','archived') NOT NULL DEFAULT 'draft',
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `careers_id` PRIMARY KEY(`id`),
	CONSTRAINT `careers_slug_uq` UNIQUE(`slug`)
);
--> statement-breakpoint
CREATE TABLE `cities` (
	`id` int unsigned AUTO_INCREMENT NOT NULL,
	`slug` varchar(128) NOT NULL,
	`name_es` varchar(160) NOT NULL,
	`department_id` int unsigned NOT NULL,
	`lat` decimal(10,7),
	`lng` decimal(10,7),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `cities_id` PRIMARY KEY(`id`),
	CONSTRAINT `cities_slug_uq` UNIQUE(`slug`)
);
--> statement-breakpoint
CREATE TABLE `claims` (
	`id` int unsigned AUTO_INCREMENT NOT NULL,
	`institution_id` int unsigned NOT NULL,
	`user_id` int unsigned,
	`email` varchar(255) NOT NULL,
	`email_domain` varchar(255) NOT NULL,
	`token_hash` varchar(64) NOT NULL,
	`expires_at` timestamp NOT NULL,
	`status` enum('pending','approved','rejected','expired') NOT NULL DEFAULT 'pending',
	`verified_at` timestamp,
	`decided_by_user_id` int unsigned,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `claims_id` PRIMARY KEY(`id`),
	CONSTRAINT `claims_token_hash_uq` UNIQUE(`token_hash`)
);
--> statement-breakpoint
CREATE TABLE `curation_conflicts` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`import_run_id` bigint unsigned,
	`source_record_id` bigint unsigned,
	`entity_type` enum('institution','campus','career','program','offering','accreditation','price','admission') NOT NULL,
	`entity_id` int unsigned,
	`kind` enum('new','changed','conflict','ambiguous_match') NOT NULL,
	`match_score` tinyint unsigned,
	`current_json` json,
	`proposed_json` json NOT NULL,
	`status` enum('open','applied','rejected','superseded') NOT NULL DEFAULT 'open',
	`resolved_by_user_id` int unsigned,
	`resolved_at` timestamp,
	`notes` text,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `curation_conflicts_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `departments` (
	`id` int unsigned AUTO_INCREMENT NOT NULL,
	`slug` varchar(128) NOT NULL,
	`name_es` varchar(160) NOT NULL,
	`code` tinyint unsigned NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `departments_id` PRIMARY KEY(`id`),
	CONSTRAINT `departments_slug_uq` UNIQUE(`slug`),
	CONSTRAINT `departments_code_uq` UNIQUE(`code`)
);
--> statement-breakpoint
CREATE TABLE `events` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`type` enum('offering_view','whatsapp_click','compare_add','lead_submit','profile_view') NOT NULL,
	`offering_id` int unsigned,
	`institution_id` int unsigned,
	`session_hash` varchar(64),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `events_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `import_runs` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`source` enum('CONES','ANEAES','DATOS_GOV_PY','MEC','INSTITUCION','MANUAL') NOT NULL,
	`status` enum('running','succeeded','failed') NOT NULL DEFAULT 'running',
	`started_at` timestamp NOT NULL DEFAULT (now()),
	`finished_at` timestamp,
	`rows_in` int unsigned NOT NULL DEFAULT 0,
	`rows_matched` int unsigned NOT NULL DEFAULT 0,
	`rows_new` int unsigned NOT NULL DEFAULT 0,
	`rows_unchanged` int unsigned NOT NULL DEFAULT 0,
	`rows_conflicted` int unsigned NOT NULL DEFAULT 0,
	`log` text,
	CONSTRAINT `import_runs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `institution_aliases` (
	`id` int unsigned AUTO_INCREMENT NOT NULL,
	`institution_id` int unsigned NOT NULL,
	`raw_name` varchar(320) NOT NULL,
	`match_key` varchar(320) NOT NULL,
	`source` enum('CONES','ANEAES','DATOS_GOV_PY','MEC','INSTITUCION','MANUAL'),
	`created_by_user_id` int unsigned,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `institution_aliases_id` PRIMARY KEY(`id`),
	CONSTRAINT `institution_aliases_match_key_uq` UNIQUE(`match_key`)
);
--> statement-breakpoint
CREATE TABLE `institution_members` (
	`id` int unsigned AUTO_INCREMENT NOT NULL,
	`user_id` int unsigned NOT NULL,
	`institution_id` int unsigned NOT NULL,
	`role` enum('institution_admin','institution_editor') NOT NULL DEFAULT 'institution_editor',
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `institution_members_id` PRIMARY KEY(`id`),
	CONSTRAINT `institution_members_uq` UNIQUE(`user_id`,`institution_id`)
);
--> statement-breakpoint
CREATE TABLE `institutions` (
	`id` int unsigned AUTO_INCREMENT NOT NULL,
	`slug` varchar(160) NOT NULL,
	`name_official` varchar(320) NOT NULL,
	`name_short` varchar(120) NOT NULL,
	`acronym` varchar(32),
	`match_key` varchar(320) NOT NULL,
	`logo_url` varchar(512),
	`brand_color` varchar(9),
	`management` enum('publica','privada') NOT NULL,
	`type` enum('universidad','instituto_superior','instituto_tecnico','ifd','otro') NOT NULL DEFAULT 'universidad',
	`cones_code` varchar(64),
	`founded_year` smallint unsigned,
	`website` varchar(512),
	`email` varchar(255),
	`phone_e164` varchar(20),
	`whatsapp_e164` varchar(20),
	`description_md` text,
	`status` enum('draft','published','archived') NOT NULL DEFAULT 'draft',
	`claimed_by_user_id` int unsigned,
	`plan_id` int unsigned,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `institutions_id` PRIMARY KEY(`id`),
	CONSTRAINT `institutions_slug_uq` UNIQUE(`slug`),
	CONSTRAINT `institutions_cones_code_uq` UNIQUE(`cones_code`)
);
--> statement-breakpoint
CREATE TABLE `leads` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`offering_id` int unsigned,
	`institution_id` int unsigned NOT NULL,
	`name` varchar(160) NOT NULL,
	`phone_e164` varchar(20) NOT NULL,
	`email` varchar(255),
	`message` text,
	`consent` boolean NOT NULL DEFAULT false,
	`consent_text_version` varchar(32) NOT NULL,
	`consent_at` timestamp NOT NULL,
	`age_bracket` enum('menor_18','18_mas','no_declarado') NOT NULL DEFAULT 'no_declarado',
	`source_page` varchar(512),
	`utm_json` json,
	`ip_hash` varchar(64),
	`user_agent` varchar(320),
	`status` enum('new','sent','contacted','qualified','discarded') NOT NULL DEFAULT 'new',
	`delivered_at` timestamp,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `leads_id` PRIMARY KEY(`id`),
	CONSTRAINT `leads_consent_required` CHECK(`leads`.`consent` = 1)
);
--> statement-breakpoint
CREATE TABLE `offerings` (
	`id` int unsigned AUTO_INCREMENT NOT NULL,
	`program_id` int unsigned NOT NULL,
	`campus_id` int unsigned NOT NULL,
	`modality` enum('presencial','semipresencial','distancia') NOT NULL DEFAULT 'presencial',
	`shift` enum('manana','tarde','noche','flexible') NOT NULL DEFAULT 'flexible',
	`duration_months` smallint unsigned,
	`credits` smallint unsigned,
	`plan_url` varchar(512),
	`enrollment_status` enum('abiertas','proximamente','cerradas','sin_datos') NOT NULL DEFAULT 'sin_datos',
	`status` enum('draft','published','archived') NOT NULL DEFAULT 'draft',
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `offerings_id` PRIMARY KEY(`id`),
	CONSTRAINT `offerings_uq` UNIQUE(`program_id`,`campus_id`,`modality`,`shift`),
	CONSTRAINT `offerings_duration_positive` CHECK(`offerings`.`duration_months` is null or `offerings`.`duration_months` > 0)
);
--> statement-breakpoint
CREATE TABLE `plans` (
	`id` int unsigned AUTO_INCREMENT NOT NULL,
	`code` varchar(32) NOT NULL,
	`name` varchar(120) NOT NULL,
	`price_usd_year` int unsigned NOT NULL,
	`program_band_min` smallint unsigned NOT NULL DEFAULT 0,
	`program_band_max` smallint unsigned,
	`included_leads_month` smallint unsigned,
	`rank` tinyint unsigned NOT NULL DEFAULT 0,
	`features_json` json,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `plans_id` PRIMARY KEY(`id`),
	CONSTRAINT `plans_code_uq` UNIQUE(`code`)
);
--> statement-breakpoint
CREATE TABLE `prices` (
	`id` int unsigned AUTO_INCREMENT NOT NULL,
	`offering_id` int unsigned NOT NULL,
	`currency` enum('PYG','USD') NOT NULL DEFAULT 'PYG',
	`matricula` bigint,
	`monthly_fee` bigint,
	`installments_per_year` tinyint unsigned,
	`admission_fee` bigint,
	`is_free` boolean NOT NULL DEFAULT false,
	`annual_cost` bigint GENERATED ALWAYS AS ((case
        when is_free = 1 then 0
        when monthly_fee is not null and installments_per_year is null then null
        when matricula is null and monthly_fee is null then null
        else coalesce(matricula, 0) + coalesce(monthly_fee, 0) * coalesce(installments_per_year, 0)
      end)) STORED,
	`is_current` boolean NOT NULL DEFAULT true,
	`current_offering_id` int unsigned GENERATED ALWAYS AS ((case when is_current = 1 then offering_id else null end)) STORED,
	`notes_md` text,
	`source` enum('institucion','relevamiento','web_publica') NOT NULL DEFAULT 'web_publica',
	`source_url` varchar(512),
	`valid_from` date,
	`valid_to` date,
	`verified_at` timestamp,
	`verified_by_user_id` int unsigned,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `prices_id` PRIMARY KEY(`id`),
	CONSTRAINT `prices_current_offering_uq` UNIQUE(`current_offering_id`),
	CONSTRAINT `prices_installments_range` CHECK(`prices`.`installments_per_year` is null or (`prices`.`installments_per_year` between 1 and 24)),
	CONSTRAINT `prices_free_has_no_fees` CHECK(`prices`.`is_free` = 0 or (`prices`.`matricula` is null and `prices`.`monthly_fee` is null)),
	CONSTRAINT `prices_non_negative` CHECK(coalesce(`prices`.`matricula`, 0) >= 0 and coalesce(`prices`.`monthly_fee`, 0) >= 0 and coalesce(`prices`.`admission_fee`, 0) >= 0)
);
--> statement-breakpoint
CREATE TABLE `program_search` (
	`offering_id` int unsigned NOT NULL,
	`program_id` int unsigned NOT NULL,
	`institution_id` int unsigned NOT NULL,
	`career_id` int unsigned,
	`campus_id` int unsigned NOT NULL,
	`city_id` int unsigned NOT NULL,
	`department_id` int unsigned NOT NULL,
	`area_id` int unsigned,
	`institution_slug` varchar(160) NOT NULL,
	`program_slug` varchar(160) NOT NULL,
	`career_slug` varchar(128),
	`area_slug` varchar(128),
	`city_slug` varchar(128) NOT NULL,
	`department_slug` varchar(128) NOT NULL,
	`program_name` varchar(320) NOT NULL,
	`career_name` varchar(200),
	`title_awarded` varchar(320),
	`institution_name` varchar(320) NOT NULL,
	`institution_short` varchar(120) NOT NULL,
	`institution_logo` varchar(512),
	`brand_color` varchar(9),
	`city_name` varchar(160) NOT NULL,
	`department_name` varchar(160) NOT NULL,
	`campus_name` varchar(200) NOT NULL,
	`level` enum('tecnicatura','grado','especializacion','maestria','doctorado') NOT NULL,
	`modality` enum('presencial','semipresencial','distancia') NOT NULL,
	`shift` enum('manana','tarde','noche','flexible') NOT NULL,
	`management` enum('publica','privada') NOT NULL,
	`institution_type` enum('universidad','instituto_superior','instituto_tecnico','ifd','otro') NOT NULL,
	`duration_months` smallint unsigned,
	`price_currency` enum('PYG','USD'),
	`matricula_gs` bigint,
	`monthly_fee_gs` bigint,
	`installments_per_year` tinyint unsigned,
	`admission_fee_gs` bigint,
	`annual_cost_gs` bigint,
	`is_free` boolean NOT NULL DEFAULT false,
	`price_verified_at` timestamp,
	`price_expires_on` date,
	`accreditation_status` enum('vigente','en_proceso','vencida','no_acreditada','sin_datos') NOT NULL DEFAULT 'sin_datos',
	`accreditation_agency` enum('ANEAES','CONES','ARCUSUR','otra'),
	`accreditation_source_url` varchar(512),
	`accreditation_valid_to` date,
	`enrollment_status` enum('abiertas','proximamente','cerradas','sin_datos') NOT NULL DEFAULT 'sin_datos',
	`admission_closes_on` date,
	`plan_rank` tinyint unsigned NOT NULL DEFAULT 0,
	`is_published` boolean NOT NULL DEFAULT false,
	`search_text` varchar(1024) NOT NULL,
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `program_search_offering_id` PRIMARY KEY(`offering_id`)
);
--> statement-breakpoint
CREATE TABLE `programs` (
	`id` int unsigned AUTO_INCREMENT NOT NULL,
	`institution_id` int unsigned NOT NULL,
	`career_id` int unsigned,
	`name_official` varchar(320) NOT NULL,
	`slug` varchar(160) NOT NULL,
	`match_key` varchar(320) NOT NULL,
	`level` enum('tecnicatura','grado','especializacion','maestria','doctorado') NOT NULL,
	`title_awarded` varchar(320),
	`description_md` text,
	`cones_resolution` varchar(120),
	`status` enum('draft','published','archived') NOT NULL DEFAULT 'draft',
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `programs_id` PRIMARY KEY(`id`),
	CONSTRAINT `programs_institution_slug_uq` UNIQUE(`institution_id`,`slug`)
);
--> statement-breakpoint
CREATE TABLE `source_records` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`source` enum('CONES','ANEAES','DATOS_GOV_PY','MEC','INSTITUCION','MANUAL') NOT NULL,
	`external_id` varchar(255),
	`source_url` varchar(512),
	`fetched_at` timestamp NOT NULL DEFAULT (now()),
	`payload_json` json NOT NULL,
	`checksum` varchar(64) NOT NULL,
	`import_run_id` bigint unsigned,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `source_records_id` PRIMARY KEY(`id`),
	CONSTRAINT `source_records_source_checksum_uq` UNIQUE(`source`,`checksum`)
);
--> statement-breakpoint
CREATE TABLE `subscriptions` (
	`id` int unsigned AUTO_INCREMENT NOT NULL,
	`institution_id` int unsigned NOT NULL,
	`plan_id` int unsigned NOT NULL,
	`status` enum('trial','active','past_due','cancelled') NOT NULL DEFAULT 'trial',
	`starts_on` date NOT NULL,
	`ends_on` date,
	`invoice_ref` varchar(120),
	`notes` text,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `subscriptions_id` PRIMARY KEY(`id`),
	CONSTRAINT `subscriptions_date_order` CHECK(`subscriptions`.`ends_on` is null or `subscriptions`.`ends_on` >= `subscriptions`.`starts_on`)
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` int unsigned AUTO_INCREMENT NOT NULL,
	`email` varchar(255) NOT NULL,
	`password_hash` varchar(255),
	`name` varchar(160),
	`role` enum('admin','editor','institution_admin','institution_editor') NOT NULL DEFAULT 'institution_editor',
	`institution_id` int unsigned,
	`status` enum('active','invited','suspended') NOT NULL DEFAULT 'invited',
	`must_change_password` boolean NOT NULL DEFAULT false,
	`last_login_at` timestamp,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `users_id` PRIMARY KEY(`id`),
	CONSTRAINT `users_email_uq` UNIQUE(`email`)
);
--> statement-breakpoint
ALTER TABLE `accreditations` ADD CONSTRAINT `accreditations_institution_id_institutions_id_fk` FOREIGN KEY (`institution_id`) REFERENCES `institutions`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `accreditations` ADD CONSTRAINT `accreditations_program_id_programs_id_fk` FOREIGN KEY (`program_id`) REFERENCES `programs`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `accreditations` ADD CONSTRAINT `accreditations_offering_id_offerings_id_fk` FOREIGN KEY (`offering_id`) REFERENCES `offerings`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `accreditations` ADD CONSTRAINT `accreditations_verified_by_user_id_users_id_fk` FOREIGN KEY (`verified_by_user_id`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `activity_log` ADD CONSTRAINT `activity_log_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `admissions` ADD CONSTRAINT `admissions_institution_id_institutions_id_fk` FOREIGN KEY (`institution_id`) REFERENCES `institutions`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `admissions` ADD CONSTRAINT `admissions_program_id_programs_id_fk` FOREIGN KEY (`program_id`) REFERENCES `programs`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `admissions` ADD CONSTRAINT `admissions_offering_id_offerings_id_fk` FOREIGN KEY (`offering_id`) REFERENCES `offerings`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `admissions` ADD CONSTRAINT `admissions_verified_by_user_id_users_id_fk` FOREIGN KEY (`verified_by_user_id`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `campuses` ADD CONSTRAINT `campuses_institution_id_institutions_id_fk` FOREIGN KEY (`institution_id`) REFERENCES `institutions`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `campuses` ADD CONSTRAINT `campuses_city_id_cities_id_fk` FOREIGN KEY (`city_id`) REFERENCES `cities`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `careers` ADD CONSTRAINT `careers_area_id_areas_id_fk` FOREIGN KEY (`area_id`) REFERENCES `areas`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `cities` ADD CONSTRAINT `cities_department_id_departments_id_fk` FOREIGN KEY (`department_id`) REFERENCES `departments`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `claims` ADD CONSTRAINT `claims_institution_id_institutions_id_fk` FOREIGN KEY (`institution_id`) REFERENCES `institutions`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `claims` ADD CONSTRAINT `claims_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `claims` ADD CONSTRAINT `claims_decided_by_user_id_users_id_fk` FOREIGN KEY (`decided_by_user_id`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `curation_conflicts` ADD CONSTRAINT `curation_conflicts_import_run_id_import_runs_id_fk` FOREIGN KEY (`import_run_id`) REFERENCES `import_runs`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `curation_conflicts` ADD CONSTRAINT `curation_conflicts_source_record_id_source_records_id_fk` FOREIGN KEY (`source_record_id`) REFERENCES `source_records`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `curation_conflicts` ADD CONSTRAINT `curation_conflicts_resolved_by_user_id_users_id_fk` FOREIGN KEY (`resolved_by_user_id`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `institution_aliases` ADD CONSTRAINT `institution_aliases_institution_id_institutions_id_fk` FOREIGN KEY (`institution_id`) REFERENCES `institutions`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `institution_aliases` ADD CONSTRAINT `institution_aliases_created_by_user_id_users_id_fk` FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `institution_members` ADD CONSTRAINT `institution_members_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `institution_members` ADD CONSTRAINT `institution_members_institution_id_institutions_id_fk` FOREIGN KEY (`institution_id`) REFERENCES `institutions`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `institutions` ADD CONSTRAINT `institutions_claimed_by_user_id_users_id_fk` FOREIGN KEY (`claimed_by_user_id`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `institutions` ADD CONSTRAINT `institutions_plan_id_plans_id_fk` FOREIGN KEY (`plan_id`) REFERENCES `plans`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `leads` ADD CONSTRAINT `leads_offering_id_offerings_id_fk` FOREIGN KEY (`offering_id`) REFERENCES `offerings`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `leads` ADD CONSTRAINT `leads_institution_id_institutions_id_fk` FOREIGN KEY (`institution_id`) REFERENCES `institutions`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `offerings` ADD CONSTRAINT `offerings_program_id_programs_id_fk` FOREIGN KEY (`program_id`) REFERENCES `programs`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `offerings` ADD CONSTRAINT `offerings_campus_id_campuses_id_fk` FOREIGN KEY (`campus_id`) REFERENCES `campuses`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `prices` ADD CONSTRAINT `prices_offering_id_offerings_id_fk` FOREIGN KEY (`offering_id`) REFERENCES `offerings`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `prices` ADD CONSTRAINT `prices_verified_by_user_id_users_id_fk` FOREIGN KEY (`verified_by_user_id`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `programs` ADD CONSTRAINT `programs_institution_id_institutions_id_fk` FOREIGN KEY (`institution_id`) REFERENCES `institutions`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `programs` ADD CONSTRAINT `programs_career_id_careers_id_fk` FOREIGN KEY (`career_id`) REFERENCES `careers`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `source_records` ADD CONSTRAINT `source_records_import_run_id_import_runs_id_fk` FOREIGN KEY (`import_run_id`) REFERENCES `import_runs`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `subscriptions` ADD CONSTRAINT `subscriptions_institution_id_institutions_id_fk` FOREIGN KEY (`institution_id`) REFERENCES `institutions`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `subscriptions` ADD CONSTRAINT `subscriptions_plan_id_plans_id_fk` FOREIGN KEY (`plan_id`) REFERENCES `plans`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `accreditations_institution_idx` ON `accreditations` (`institution_id`);--> statement-breakpoint
CREATE INDEX `accreditations_program_idx` ON `accreditations` (`program_id`);--> statement-breakpoint
CREATE INDEX `accreditations_offering_idx` ON `accreditations` (`offering_id`);--> statement-breakpoint
CREATE INDEX `accreditations_status_idx` ON `accreditations` (`status`);--> statement-breakpoint
CREATE INDEX `activity_log_entity_idx` ON `activity_log` (`entity_type`,`entity_id`);--> statement-breakpoint
CREATE INDEX `activity_log_user_idx` ON `activity_log` (`user_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `admissions_institution_idx` ON `admissions` (`institution_id`);--> statement-breakpoint
CREATE INDEX `admissions_program_idx` ON `admissions` (`program_id`);--> statement-breakpoint
CREATE INDEX `admissions_offering_idx` ON `admissions` (`offering_id`);--> statement-breakpoint
CREATE INDEX `admissions_window_idx` ON `admissions` (`registration_opens`,`registration_closes`);--> statement-breakpoint
CREATE INDEX `campuses_city_idx` ON `campuses` (`city_id`);--> statement-breakpoint
CREATE INDEX `careers_area_idx` ON `careers` (`area_id`);--> statement-breakpoint
CREATE INDEX `cities_department_idx` ON `cities` (`department_id`);--> statement-breakpoint
CREATE INDEX `claims_institution_idx` ON `claims` (`institution_id`);--> statement-breakpoint
CREATE INDEX `claims_status_idx` ON `claims` (`status`);--> statement-breakpoint
CREATE INDEX `curation_conflicts_status_idx` ON `curation_conflicts` (`status`,`entity_type`);--> statement-breakpoint
CREATE INDEX `curation_conflicts_run_idx` ON `curation_conflicts` (`import_run_id`);--> statement-breakpoint
CREATE INDEX `curation_conflicts_entity_idx` ON `curation_conflicts` (`entity_type`,`entity_id`);--> statement-breakpoint
CREATE INDEX `events_institution_created_idx` ON `events` (`institution_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `events_type_created_idx` ON `events` (`type`,`created_at`);--> statement-breakpoint
CREATE INDEX `events_offering_idx` ON `events` (`offering_id`);--> statement-breakpoint
CREATE INDEX `import_runs_source_started_idx` ON `import_runs` (`source`,`started_at`);--> statement-breakpoint
CREATE INDEX `institution_aliases_institution_idx` ON `institution_aliases` (`institution_id`);--> statement-breakpoint
CREATE INDEX `institution_members_institution_idx` ON `institution_members` (`institution_id`);--> statement-breakpoint
CREATE INDEX `institutions_match_key_idx` ON `institutions` (`match_key`);--> statement-breakpoint
CREATE INDEX `institutions_status_idx` ON `institutions` (`status`);--> statement-breakpoint
CREATE INDEX `institutions_management_idx` ON `institutions` (`management`);--> statement-breakpoint
CREATE INDEX `leads_institution_created_idx` ON `leads` (`institution_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `leads_offering_idx` ON `leads` (`offering_id`);--> statement-breakpoint
CREATE INDEX `leads_status_idx` ON `leads` (`status`);--> statement-breakpoint
CREATE INDEX `offerings_campus_idx` ON `offerings` (`campus_id`);--> statement-breakpoint
CREATE INDEX `offerings_status_idx` ON `offerings` (`status`);--> statement-breakpoint
CREATE INDEX `prices_offering_idx` ON `prices` (`offering_id`);--> statement-breakpoint
CREATE INDEX `prices_annual_cost_idx` ON `prices` (`annual_cost`);--> statement-breakpoint
CREATE INDEX `prices_verified_at_idx` ON `prices` (`verified_at`);--> statement-breakpoint
CREATE INDEX `ps_level_management_modality_idx` ON `program_search` (`level`,`management`,`modality`);--> statement-breakpoint
CREATE INDEX `ps_city_idx` ON `program_search` (`city_id`);--> statement-breakpoint
CREATE INDEX `ps_department_idx` ON `program_search` (`department_id`);--> statement-breakpoint
CREATE INDEX `ps_career_idx` ON `program_search` (`career_id`);--> statement-breakpoint
CREATE INDEX `ps_institution_idx` ON `program_search` (`institution_id`);--> statement-breakpoint
CREATE INDEX `ps_area_idx` ON `program_search` (`area_id`);--> statement-breakpoint
CREATE INDEX `ps_accreditation_idx` ON `program_search` (`accreditation_status`);--> statement-breakpoint
CREATE INDEX `ps_enrollment_idx` ON `program_search` (`enrollment_status`);--> statement-breakpoint
CREATE INDEX `ps_monthly_fee_idx` ON `program_search` (`monthly_fee_gs`);--> statement-breakpoint
CREATE INDEX `ps_annual_cost_idx` ON `program_search` (`annual_cost_gs`);--> statement-breakpoint
CREATE INDEX `ps_duration_idx` ON `program_search` (`duration_months`);--> statement-breakpoint
CREATE INDEX `ps_published_rank_idx` ON `program_search` (`is_published`,`plan_rank`);--> statement-breakpoint
CREATE INDEX `programs_career_idx` ON `programs` (`career_id`);--> statement-breakpoint
CREATE INDEX `programs_level_idx` ON `programs` (`level`);--> statement-breakpoint
CREATE INDEX `programs_status_idx` ON `programs` (`status`);--> statement-breakpoint
CREATE INDEX `programs_match_key_idx` ON `programs` (`match_key`);--> statement-breakpoint
CREATE INDEX `source_records_source_external_idx` ON `source_records` (`source`,`external_id`);--> statement-breakpoint
CREATE INDEX `source_records_import_run_idx` ON `source_records` (`import_run_id`);--> statement-breakpoint
CREATE INDEX `subscriptions_institution_idx` ON `subscriptions` (`institution_id`);--> statement-breakpoint
CREATE INDEX `subscriptions_status_idx` ON `subscriptions` (`status`);--> statement-breakpoint
CREATE INDEX `users_institution_idx` ON `users` (`institution_id`);