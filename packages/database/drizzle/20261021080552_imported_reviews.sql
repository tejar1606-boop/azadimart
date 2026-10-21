CREATE TYPE "public"."review_source" AS ENUM('VERIFIED_PURCHASE', 'IMPORTED');--> statement-breakpoint
ALTER TYPE "public"."review_status" ADD VALUE 'PENDING';--> statement-breakpoint
ALTER TABLE "product_reviews" ALTER COLUMN "customer_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "product_reviews" ALTER COLUMN "order_item_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "product_reviews" ADD COLUMN "source" "review_source" DEFAULT 'VERIFIED_PURCHASE' NOT NULL;--> statement-breakpoint
ALTER TABLE "product_reviews" ADD COLUMN "imported_author_name" text;--> statement-breakpoint
ALTER TABLE "product_reviews" ADD COLUMN "imported_source_name" text;--> statement-breakpoint
ALTER TABLE "product_reviews" ADD COLUMN "imported_reviewed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "product_reviews" ADD COLUMN "import_proof_asset_id" uuid;--> statement-breakpoint
ALTER TABLE "product_reviews" ADD COLUMN "added_by_user_id" uuid;--> statement-breakpoint
ALTER TABLE "product_reviews" ADD COLUMN "pinned_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "product_reviews" ADD CONSTRAINT "product_reviews_import_proof_asset_id_media_assets_id_fk" FOREIGN KEY ("import_proof_asset_id") REFERENCES "public"."media_assets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_reviews" ADD CONSTRAINT "product_reviews_added_by_user_id_users_id_fk" FOREIGN KEY ("added_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_reviews" ADD CONSTRAINT "product_reviews_source_fields" CHECK (("product_reviews"."source" = 'VERIFIED_PURCHASE' and "product_reviews"."customer_id" is not null and "product_reviews"."order_item_id" is not null)
      or ("product_reviews"."source" = 'IMPORTED' and "product_reviews"."imported_author_name" is not null and "product_reviews"."imported_source_name" is not null and "product_reviews"."import_proof_asset_id" is not null));