CREATE TYPE "public"."aplus_status" AS ENUM('DRAFT', 'PENDING_REVIEW', 'APPROVED', 'REJECTED');--> statement-breakpoint
ALTER TABLE "product_aplus_content" ADD COLUMN "draft_blocks" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "product_aplus_content" ADD COLUMN "status" "aplus_status" DEFAULT 'DRAFT' NOT NULL;--> statement-breakpoint
ALTER TABLE "product_aplus_content" ADD COLUMN "review_notes" text;--> statement-breakpoint
ALTER TABLE "product_aplus_content" ADD COLUMN "submitted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "product_aplus_content" ADD COLUMN "reviewed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "product_aplus_content" ADD COLUMN "reviewed_by_user_id" uuid;--> statement-breakpoint
ALTER TABLE "product_aplus_content" ADD CONSTRAINT "product_aplus_content_reviewed_by_user_id_users_id_fk" FOREIGN KEY ("reviewed_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "product_aplus_content_status_idx" ON "product_aplus_content" USING btree ("status");--> statement-breakpoint
-- Existing (already shown) content counts as approved, with its draft starting as a copy.
UPDATE "product_aplus_content" SET "status" = 'APPROVED', "draft_blocks" = "blocks" WHERE jsonb_array_length("blocks") > 0;
