ALTER TABLE "carts" ADD COLUMN "last_reminder_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "carts" ADD COLUMN "reminder_count" integer DEFAULT 0 NOT NULL;