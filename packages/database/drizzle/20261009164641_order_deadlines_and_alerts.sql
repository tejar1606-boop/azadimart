CREATE TYPE "public"."cancel_actor" AS ENUM('CUSTOMER', 'SELLER', 'ADMIN', 'SYSTEM');--> statement-breakpoint
CREATE TABLE "push_subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"seller_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"endpoint" text NOT NULL,
	"p256dh" text NOT NULL,
	"auth" text NOT NULL,
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "seller_notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"seller_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"title" text NOT NULL,
	"body" text,
	"href" text,
	"dedupe_key" text,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "ship_by_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "packed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "cancelled_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "cancelled_by" "cancel_actor";--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "cancellation_reason" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "cancel_requested_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "cancel_requested_by_seller_id" uuid;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "cancel_request_reason" text;--> statement-breakpoint
ALTER TABLE "push_subscriptions" ADD CONSTRAINT "push_subscriptions_seller_id_sellers_id_fk" FOREIGN KEY ("seller_id") REFERENCES "public"."sellers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "push_subscriptions" ADD CONSTRAINT "push_subscriptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seller_notifications" ADD CONSTRAINT "seller_notifications_seller_id_sellers_id_fk" FOREIGN KEY ("seller_id") REFERENCES "public"."sellers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "push_subscriptions_endpoint_unique" ON "push_subscriptions" USING btree ("endpoint");--> statement-breakpoint
CREATE INDEX "push_subscriptions_seller_idx" ON "push_subscriptions" USING btree ("seller_id");--> statement-breakpoint
CREATE INDEX "seller_notifications_seller_created_idx" ON "seller_notifications" USING btree ("seller_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "seller_notifications_dedupe_unique" ON "seller_notifications" USING btree ("seller_id","dedupe_key");--> statement-breakpoint
CREATE INDEX "orders_ship_by_idx" ON "orders" USING btree ("ship_by_at");--> statement-breakpoint
-- Existing orders: ship-by is 2 days after the order, and cancelled orders use their last update as the cancellation time.
UPDATE "orders" SET "ship_by_at" = "created_at" + interval '2 days' WHERE "ship_by_at" IS NULL;--> statement-breakpoint
UPDATE "orders" SET "cancelled_at" = "updated_at" WHERE "status" = 'CANCELLED' AND "cancelled_at" IS NULL;
