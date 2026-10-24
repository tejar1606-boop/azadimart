CREATE TABLE "seller_commission_free_periods" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"seller_id" uuid NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"reason" text NOT NULL,
	"referred_seller_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "seller_commission_free_periods_order" CHECK ("seller_commission_free_periods"."ends_at" > "seller_commission_free_periods"."starts_at")
);
--> statement-breakpoint
ALTER TABLE "sellers" ADD COLUMN "referral_code" text;--> statement-breakpoint
ALTER TABLE "sellers" ADD COLUMN "referred_by_seller_id" uuid;--> statement-breakpoint
ALTER TABLE "sellers" ADD COLUMN "referral_rewarded_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "seller_commission_free_periods" ADD CONSTRAINT "seller_commission_free_periods_seller_id_sellers_id_fk" FOREIGN KEY ("seller_id") REFERENCES "public"."sellers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seller_commission_free_periods" ADD CONSTRAINT "seller_commission_free_periods_referred_seller_id_sellers_id_fk" FOREIGN KEY ("referred_seller_id") REFERENCES "public"."sellers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "seller_commission_free_periods_seller_idx" ON "seller_commission_free_periods" USING btree ("seller_id","starts_at");--> statement-breakpoint
CREATE UNIQUE INDEX "seller_commission_free_periods_referred_unique" ON "seller_commission_free_periods" USING btree ("referred_seller_id");--> statement-breakpoint
ALTER TABLE "sellers" ADD CONSTRAINT "sellers_referred_by_seller_id_sellers_id_fk" FOREIGN KEY ("referred_by_seller_id") REFERENCES "public"."sellers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "sellers_referral_code_unique" ON "sellers" USING btree ("referral_code");--> statement-breakpoint
CREATE INDEX "sellers_referred_by_idx" ON "sellers" USING btree ("referred_by_seller_id");--> statement-breakpoint
ALTER TABLE "sellers" ADD CONSTRAINT "sellers_no_self_referral" CHECK ("sellers"."referred_by_seller_id" is null or "sellers"."referred_by_seller_id" <> "sellers"."id");