CREATE TABLE `budgets` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`category_id` text NOT NULL,
	`monthly_cents` integer NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `budgets_user_category` ON `budgets` (`user_id`,`category_id`);--> statement-breakpoint
CREATE TABLE `debts` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`kind` text DEFAULT 'loan' NOT NULL,
	`name` text NOT NULL,
	`lender` text,
	`currency` text DEFAULT 'EUR' NOT NULL,
	`principal_cents` integer,
	`balance_cents` integer NOT NULL,
	`annual_rate_bps` integer DEFAULT 0 NOT NULL,
	`apr_bps` integer,
	`monthly_payment_cents` integer NOT NULL,
	`credit_limit_cents` integer,
	`payment_day` integer,
	`started_on` text,
	`ends_on` text,
	`scope` text DEFAULT 'personal' NOT NULL,
	`merchant` text,
	`notes` text,
	`is_active` integer DEFAULT true NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `planned_flows` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`amount_cents` integer NOT NULL,
	`currency` text DEFAULT 'EUR' NOT NULL,
	`cycle` text DEFAULT 'once' NOT NULL,
	`next_on` text NOT NULL,
	`ends_on` text,
	`scope` text DEFAULT 'personal' NOT NULL,
	`category_id` text,
	`notes` text,
	`is_active` integer DEFAULT true NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `savings_goals` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`target_cents` integer NOT NULL,
	`saved_cents` integer DEFAULT 0 NOT NULL,
	`account_ids` text,
	`target_on` text,
	`scope` text DEFAULT 'personal' NOT NULL,
	`notes` text,
	`is_archived` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
