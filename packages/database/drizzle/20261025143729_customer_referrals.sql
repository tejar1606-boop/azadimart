CREATE TABLE "customer_referral_rewards" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"referrer_customer_id" uuid NOT NULL,
	"referred_customer_id" uuid NOT NULL,
	"order_id" uuid,
	"status" text NOT NULL,
	"reason" text,
	"amount_paise" integer DEFAULT 0 NOT NULL,
	"wallet_entry_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "referral_code" text;--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "referred_by_customer_id" uuid;--> statement-breakpoint
ALTER TABLE "customer_referral_rewards" ADD CONSTRAINT "customer_referral_rewards_referrer_customer_id_customers_id_fk" FOREIGN KEY ("referrer_customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_referral_rewards" ADD CONSTRAINT "customer_referral_rewards_referred_customer_id_customers_id_fk" FOREIGN KEY ("referred_customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_referral_rewards" ADD CONSTRAINT "customer_referral_rewards_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_referral_rewards" ADD CONSTRAINT "customer_referral_rewards_wallet_entry_id_customer_wallet_entries_id_fk" FOREIGN KEY ("wallet_entry_id") REFERENCES "public"."customer_wallet_entries"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "customer_referral_rewards_referred_unique" ON "customer_referral_rewards" USING btree ("referred_customer_id");--> statement-breakpoint
CREATE INDEX "customer_referral_rewards_referrer_idx" ON "customer_referral_rewards" USING btree ("referrer_customer_id","created_at");--> statement-breakpoint
ALTER TABLE "customers" ADD CONSTRAINT "customers_referred_by_customer_id_customers_id_fk" FOREIGN KEY ("referred_by_customer_id") REFERENCES "public"."customers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "customers_referral_code_unique" ON "customers" USING btree ("referral_code");--> statement-breakpoint
CREATE INDEX "customers_referred_by_idx" ON "customers" USING btree ("referred_by_customer_id");