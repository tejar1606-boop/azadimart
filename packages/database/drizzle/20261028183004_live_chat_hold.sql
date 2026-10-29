ALTER TABLE "live_chats" ADD COLUMN "held_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "live_chats" ADD COLUMN "hold_reason" text;--> statement-breakpoint
ALTER TABLE "live_chats" ADD COLUMN "hold_note" text;