ALTER TABLE "ad_campaigns" ALTER COLUMN "desktop_image_asset_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "sellers" ADD COLUMN "ad_credit_limit_paise" integer;--> statement-breakpoint
ALTER TABLE "ad_slots" ADD COLUMN "category_id" uuid;--> statement-breakpoint
ALTER TABLE "seller_charges" ADD COLUMN "base_paise" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "seller_charges" ADD COLUMN "gst_paise" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "ad_slots" ADD CONSTRAINT "ad_slots_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
-- Charges made before GST was split out were the bid alone
UPDATE "seller_charges" SET "base_paise" = "amount_paise" WHERE "base_paise" = 0;