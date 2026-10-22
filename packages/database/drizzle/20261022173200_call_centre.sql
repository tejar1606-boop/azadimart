CREATE TABLE "call_agents" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"status" text DEFAULT 'OFFLINE' NOT NULL,
	"provider_agent_id" text,
	"last_seen_at" timestamp with time zone,
	"last_call_ended_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "calls" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"direction" text NOT NULL,
	"status" text NOT NULL,
	"provider" text NOT NULL,
	"provider_call_id" text,
	"customer_phone" text NOT NULL,
	"business_number" text,
	"ivr_choice" text,
	"customer_id" uuid,
	"seller_id" uuid,
	"order_id" uuid,
	"ticket_id" uuid,
	"agent_user_id" uuid,
	"skipped_agent_ids" uuid[] DEFAULT '{}' NOT NULL,
	"offered_at" timestamp with time zone,
	"answered_at" timestamp with time zone,
	"ended_at" timestamp with time zone,
	"wait_seconds" integer,
	"duration_seconds" integer,
	"recording_url" text,
	"outcome" text,
	"notes" text,
	"callback_done_at" timestamp with time zone,
	"callback_by_user_id" uuid,
	"events" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "call_agents" ADD CONSTRAINT "call_agents_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calls" ADD CONSTRAINT "calls_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calls" ADD CONSTRAINT "calls_seller_id_sellers_id_fk" FOREIGN KEY ("seller_id") REFERENCES "public"."sellers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calls" ADD CONSTRAINT "calls_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calls" ADD CONSTRAINT "calls_ticket_id_support_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."support_tickets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calls" ADD CONSTRAINT "calls_agent_user_id_users_id_fk" FOREIGN KEY ("agent_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calls" ADD CONSTRAINT "calls_callback_by_user_id_users_id_fk" FOREIGN KEY ("callback_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "calls_provider_call_unique" ON "calls" USING btree ("provider","provider_call_id");--> statement-breakpoint
CREATE INDEX "calls_status_idx" ON "calls" USING btree ("status");--> statement-breakpoint
CREATE INDEX "calls_agent_idx" ON "calls" USING btree ("agent_user_id");--> statement-breakpoint
CREATE INDEX "calls_phone_idx" ON "calls" USING btree ("customer_phone");--> statement-breakpoint
CREATE INDEX "calls_created_idx" ON "calls" USING btree ("created_at");