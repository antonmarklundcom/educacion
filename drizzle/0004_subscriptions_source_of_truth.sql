ALTER TABLE `institutions` DROP FOREIGN KEY `institutions_plan_id_plans_id_fk`;
--> statement-breakpoint
ALTER TABLE `subscriptions` ADD `invoiced_amount_pyg` bigint;--> statement-breakpoint
CREATE INDEX `subscriptions_ends_on_idx` ON `subscriptions` (`ends_on`);--> statement-breakpoint
ALTER TABLE `institutions` DROP COLUMN `plan_id`;