CREATE TABLE `subscription_reminders` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`subscription_id` int unsigned NOT NULL,
	`period_ends_on` date NOT NULL,
	`threshold_days` smallint unsigned NOT NULL,
	`sent_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `subscription_reminders_id` PRIMARY KEY(`id`),
	CONSTRAINT `subscription_reminders_uq` UNIQUE(`subscription_id`,`period_ends_on`,`threshold_days`)
);
--> statement-breakpoint
ALTER TABLE `subscription_reminders` ADD CONSTRAINT `subscription_reminders_subscription_id_subscriptions_id_fk` FOREIGN KEY (`subscription_id`) REFERENCES `subscriptions`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `subscription_reminders_subscription_idx` ON `subscription_reminders` (`subscription_id`);