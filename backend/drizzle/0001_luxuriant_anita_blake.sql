DROP INDEX `locations_latitude_longitude_unique`;--> statement-breakpoint
ALTER TABLE `locations` ADD `session_id` text DEFAULT 'legacy' NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `locations_session_latitude_longitude_unique` ON `locations` (`session_id`,`latitude`,`longitude`);