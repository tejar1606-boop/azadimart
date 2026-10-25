CREATE TABLE "seller_ad_credits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"seller_id" uuid NOT NULL,
	"reason" text NOT NULL,
	"referred_seller_id" uuid,
	"status" text DEFAULT 'AVAILABLE' NOT NULL,
	"bid_id" uuid,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "seller_ad_credits" ADD CONSTRAINT "seller_ad_credits_seller_id_sellers_id_fk" FOREIGN KEY ("seller_id") REFERENCES "public"."sellers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seller_ad_credits" ADD CONSTRAINT "seller_ad_credits_referred_seller_id_sellers_id_fk" FOREIGN KEY ("referred_seller_id") REFERENCES "public"."sellers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seller_ad_credits" ADD CONSTRAINT "seller_ad_credits_bid_id_ad_bids_id_fk" FOREIGN KEY ("bid_id") REFERENCES "public"."ad_bids"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "seller_ad_credits_seller_idx" ON "seller_ad_credits" USING btree ("seller_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "seller_ad_credits_referred_unique" ON "seller_ad_credits" USING btree ("referred_seller_id");