CREATE TABLE "ad_bids" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slot_id" uuid NOT NULL,
	"campaign_id" uuid NOT NULL,
	"seller_id" uuid NOT NULL,
	"day" date NOT NULL,
	"amount_paise" integer NOT NULL,
	"kind" text NOT NULL,
	"status" text NOT NULL,
	"impressions" integer DEFAULT 0 NOT NULL,
	"clicks" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ad_campaigns" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"seller_id" uuid NOT NULL,
	"slot_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"headline" text NOT NULL,
	"desktop_image_asset_id" uuid NOT NULL,
	"mobile_image_asset_id" uuid,
	"status" text DEFAULT 'PENDING_REVIEW' NOT NULL,
	"review_note" text,
	"reviewed_by_user_id" uuid,
	"reviewed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ad_slot_closed_days" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slot_id" uuid NOT NULL,
	"day" date NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ad_slots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"placement" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"base_price_paise" integer NOT NULL,
	"buy_now_price_paise" integer,
	"bid_increment_paise" integer NOT NULL,
	"close_hours_before" integer DEFAULT 12 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "seller_charges" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"seller_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"reference_id" uuid NOT NULL,
	"description" text NOT NULL,
	"amount_paise" integer NOT NULL,
	"status" text DEFAULT 'PENDING' NOT NULL,
	"payout_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "payouts" ADD COLUMN "charges_paise" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "ad_bids" ADD CONSTRAINT "ad_bids_slot_id_ad_slots_id_fk" FOREIGN KEY ("slot_id") REFERENCES "public"."ad_slots"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ad_bids" ADD CONSTRAINT "ad_bids_campaign_id_ad_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."ad_campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ad_bids" ADD CONSTRAINT "ad_bids_seller_id_sellers_id_fk" FOREIGN KEY ("seller_id") REFERENCES "public"."sellers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ad_campaigns" ADD CONSTRAINT "ad_campaigns_seller_id_sellers_id_fk" FOREIGN KEY ("seller_id") REFERENCES "public"."sellers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ad_campaigns" ADD CONSTRAINT "ad_campaigns_slot_id_ad_slots_id_fk" FOREIGN KEY ("slot_id") REFERENCES "public"."ad_slots"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ad_campaigns" ADD CONSTRAINT "ad_campaigns_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ad_campaigns" ADD CONSTRAINT "ad_campaigns_desktop_image_asset_id_media_assets_id_fk" FOREIGN KEY ("desktop_image_asset_id") REFERENCES "public"."media_assets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ad_campaigns" ADD CONSTRAINT "ad_campaigns_mobile_image_asset_id_media_assets_id_fk" FOREIGN KEY ("mobile_image_asset_id") REFERENCES "public"."media_assets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ad_campaigns" ADD CONSTRAINT "ad_campaigns_reviewed_by_user_id_users_id_fk" FOREIGN KEY ("reviewed_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ad_slot_closed_days" ADD CONSTRAINT "ad_slot_closed_days_slot_id_ad_slots_id_fk" FOREIGN KEY ("slot_id") REFERENCES "public"."ad_slots"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seller_charges" ADD CONSTRAINT "seller_charges_seller_id_sellers_id_fk" FOREIGN KEY ("seller_id") REFERENCES "public"."sellers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seller_charges" ADD CONSTRAINT "seller_charges_payout_id_payouts_id_fk" FOREIGN KEY ("payout_id") REFERENCES "public"."payouts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ad_bids_slot_day_idx" ON "ad_bids" USING btree ("slot_id","day");--> statement-breakpoint
CREATE INDEX "ad_bids_seller_idx" ON "ad_bids" USING btree ("seller_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ad_bids_one_winner" ON "ad_bids" USING btree ("slot_id","day") WHERE status = 'WON';--> statement-breakpoint
CREATE UNIQUE INDEX "ad_bids_one_top" ON "ad_bids" USING btree ("slot_id","day") WHERE status = 'ACTIVE';--> statement-breakpoint
CREATE INDEX "ad_campaigns_seller_idx" ON "ad_campaigns" USING btree ("seller_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ad_slot_closed_days_unique" ON "ad_slot_closed_days" USING btree ("slot_id","day");--> statement-breakpoint
CREATE UNIQUE INDEX "seller_charges_reference_unique" ON "seller_charges" USING btree ("kind","reference_id");--> statement-breakpoint
CREATE INDEX "seller_charges_seller_status_idx" ON "seller_charges" USING btree ("seller_id","status");