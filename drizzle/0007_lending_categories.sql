ALTER TABLE `categories` ADD `is_lending` integer DEFAULT false NOT NULL;--> statement-breakpoint
UPDATE `categories` SET `is_lending` = true WHERE lower(`name`) LIKE '%tiene que volver%' OR lower(`name`) LIKE '%prestado%' OR lower(`name`) LIKE 'dejar dinero%';
