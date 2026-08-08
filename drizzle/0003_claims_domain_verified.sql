ALTER TABLE `claims` ADD `contact_name` varchar(160);--> statement-breakpoint
ALTER TABLE `claims` ADD `note` varchar(500);--> statement-breakpoint
ALTER TABLE `claims` ADD `domain_verified` boolean DEFAULT false NOT NULL;