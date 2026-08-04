CREATE INDEX `leads_phone_created_idx` ON `leads` (`phone_e164`,`created_at`);--> statement-breakpoint
CREATE INDEX `leads_ip_created_idx` ON `leads` (`ip_hash`,`created_at`);