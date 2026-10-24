CREATE TABLE "customer_wallet_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"customer_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"amount_paise" integer NOT NULL,
	"remaining_paise" integer DEFAULT 0 NOT NULL,
	"expires_at" timestamp with time zone,
	"order_id" uuid,
	"allocations" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"note" text,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "signup_bonus_claims" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"customer_id" uuid NOT NULL,
	"phone" text NOT NULL,
	"device_id" text,
	"fingerprint" text,
	"ip_address" text,
	"user_agent" text,
	"status" text NOT NULL,
	"reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "phone_verified_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "wallet_paise" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "customer_wallet_entries" ADD CONSTRAINT "customer_wallet_entries_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_wallet_entries" ADD CONSTRAINT "customer_wallet_entries_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_wallet_entries" ADD CONSTRAINT "customer_wallet_entries_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "signup_bonus_claims" ADD CONSTRAINT "signup_bonus_claims_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "customer_wallet_entries_customer_idx" ON "customer_wallet_entries" USING btree ("customer_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "customer_wallet_spend_order_unique" ON "customer_wallet_entries" USING btree ("order_id","kind") WHERE "customer_wallet_entries"."kind" in ('ORDER_SPEND', 'ORDER_REFUND');--> statement-breakpoint
CREATE UNIQUE INDEX "signup_bonus_phone_granted_unique" ON "signup_bonus_claims" USING btree ("phone") WHERE "signup_bonus_claims"."status" = 'GRANTED';--> statement-breakpoint
CREATE UNIQUE INDEX "signup_bonus_customer_granted_unique" ON "signup_bonus_claims" USING btree ("customer_id") WHERE "signup_bonus_claims"."status" = 'GRANTED';--> statement-breakpoint
CREATE INDEX "signup_bonus_device_idx" ON "signup_bonus_claims" USING btree ("device_id");--> statement-breakpoint
CREATE INDEX "signup_bonus_fingerprint_idx" ON "signup_bonus_claims" USING btree ("fingerprint");--> statement-breakpoint
CREATE INDEX "signup_bonus_ip_idx" ON "signup_bonus_claims" USING btree ("ip_address","created_at");