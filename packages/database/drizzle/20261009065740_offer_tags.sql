CREATE TYPE "public"."offer_tag_tone" AS ENUM('SAFFRON', 'GREEN', 'RED', 'NAVY', 'PINK', 'PURPLE');--> statement-breakpoint
CREATE TABLE "offer_tags" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"label" text NOT NULL,
	"tone" "offer_tag_tone" DEFAULT 'SAFFRON' NOT NULL,
	"scope" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"starts_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ends_at" timestamp with time zone,
	"priority" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "price_dropped_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "price_before_drop_paise" integer;--> statement-breakpoint
CREATE INDEX "offer_tags_active_idx" ON "offer_tags" USING btree ("is_active","starts_at");