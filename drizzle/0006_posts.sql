CREATE TABLE `posts` (
	`id` int unsigned AUTO_INCREMENT NOT NULL,
	`slug` varchar(160) NOT NULL,
	`title` varchar(200) NOT NULL,
	`excerpt` varchar(320) NOT NULL,
	`body_md` text NOT NULL,
	`author_name` varchar(160) NOT NULL,
	`author_bio` varchar(320),
	`status` enum('draft','published','archived') NOT NULL DEFAULT 'draft',
	`published_at` timestamp,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `posts_id` PRIMARY KEY(`id`),
	CONSTRAINT `posts_slug_uq` UNIQUE(`slug`)
);
--> statement-breakpoint
CREATE INDEX `posts_status_published_idx` ON `posts` (`status`,`published_at`);