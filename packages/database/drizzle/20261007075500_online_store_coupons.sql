CREATE TYPE "coupon_discount_type" AS ENUM ('PERCENTAGE', 'FIXED', 'FREE_SHIPPING');--> statement-breakpoint
CREATE TYPE "coupon_funding_type" AS ENUM ('AZADIMART', 'SELLER');--> statement-breakpoint

CREATE TABLE "coupons" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "code" text NOT NULL,
  "title" text NOT NULL,
  "description" text,
  "discount_type" "coupon_discount_type" NOT NULL,
  "discount_value" integer DEFAULT 0 NOT NULL,
  "minimum_order_paise" integer DEFAULT 0 NOT NULL,
  "maximum_discount_paise" integer,
  "starts_at" timestamp with time zone NOT NULL,
  "ends_at" timestamp with time zone,
  "usage_limit" integer,
  "usage_count" integer DEFAULT 0 NOT NULL,
  "per_customer_limit" integer DEFAULT 1 NOT NULL,
  "first_order_only" boolean DEFAULT false NOT NULL,
  "stackable" boolean DEFAULT false NOT NULL,
  "funding_type" "coupon_funding_type" DEFAULT 'AZADIMART' NOT NULL,
  "seller_id" uuid,
  "scope" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "is_active" boolean DEFAULT true NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX "coupons_code_unique" ON "coupons" USING btree ("code");--> statement-breakpoint
CREATE INDEX "coupons_active_window_idx" ON "coupons" USING btree ("is_active","starts_at","ends_at");--> statement-breakpoint
CREATE INDEX "coupons_seller_id_idx" ON "coupons" USING btree ("seller_id");--> statement-breakpoint
ALTER TABLE "coupons" ADD CONSTRAINT "coupons_seller_id_fkey" FOREIGN KEY ("seller_id") REFERENCES "public"."sellers"("id") ON DELETE set null;--> statement-breakpoint

CREATE TABLE "coupon_redemptions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "coupon_id" uuid NOT NULL,
  "customer_id" uuid,
  "order_id" uuid NOT NULL,
  "discount_paise" integer NOT NULL,
  "redeemed_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX "coupon_redemptions_coupon_order_unique" ON "coupon_redemptions" USING btree ("coupon_id","order_id");--> statement-breakpoint
CREATE INDEX "coupon_redemptions_customer_idx" ON "coupon_redemptions" USING btree ("customer_id");--> statement-breakpoint
ALTER TABLE "coupon_redemptions" ADD CONSTRAINT "coupon_redemptions_coupon_id_fkey" FOREIGN KEY ("coupon_id") REFERENCES "public"."coupons"("id") ON DELETE restrict;--> statement-breakpoint
ALTER TABLE "coupon_redemptions" ADD CONSTRAINT "coupon_redemptions_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE set null;--> statement-breakpoint
ALTER TABLE "coupon_redemptions" ADD CONSTRAINT "coupon_redemptions_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE restrict;
