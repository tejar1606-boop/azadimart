CREATE TABLE "live_chat_agents" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"status" text DEFAULT 'OFFLINE' NOT NULL,
	"max_chats" integer DEFAULT 3 NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "live_chat_messages" (
	"seq" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "live_chat_messages_seq_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"chat_id" uuid NOT NULL,
	"author" text NOT NULL,
	"agent_user_id" uuid,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "live_chats" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source" text NOT NULL,
	"requester_type" text NOT NULL,
	"user_id" uuid,
	"customer_id" uuid,
	"seller_id" uuid,
	"guest_name" text,
	"guest_contact" text,
	"guest_token_hash" text,
	"topic" text DEFAULT 'OTHER' NOT NULL,
	"page" text,
	"status" text DEFAULT 'WAITING' NOT NULL,
	"assigned_agent_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"queued_at" timestamp with time zone DEFAULT now() NOT NULL,
	"accepted_at" timestamp with time zone,
	"first_agent_reply_at" timestamp with time zone,
	"ended_at" timestamp with time zone,
	"ended_by" text,
	"end_reason" text,
	"requester_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"requester_typing_at" timestamp with time zone,
	"agent_typing_at" timestamp with time zone,
	"requester_read_seq" bigint DEFAULT 0 NOT NULL,
	"agent_read_seq" bigint DEFAULT 0 NOT NULL,
	"rating" integer,
	"rating_note" text,
	"ticket_id" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "live_chat_agents" ADD CONSTRAINT "live_chat_agents_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "live_chat_messages" ADD CONSTRAINT "live_chat_messages_chat_id_live_chats_id_fk" FOREIGN KEY ("chat_id") REFERENCES "public"."live_chats"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "live_chat_messages" ADD CONSTRAINT "live_chat_messages_agent_user_id_users_id_fk" FOREIGN KEY ("agent_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "live_chats" ADD CONSTRAINT "live_chats_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "live_chats" ADD CONSTRAINT "live_chats_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "live_chats" ADD CONSTRAINT "live_chats_seller_id_sellers_id_fk" FOREIGN KEY ("seller_id") REFERENCES "public"."sellers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "live_chats" ADD CONSTRAINT "live_chats_assigned_agent_id_users_id_fk" FOREIGN KEY ("assigned_agent_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "live_chats" ADD CONSTRAINT "live_chats_ticket_id_support_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."support_tickets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "live_chat_messages_chat_idx" ON "live_chat_messages" USING btree ("chat_id","seq");--> statement-breakpoint
CREATE INDEX "live_chats_status_idx" ON "live_chats" USING btree ("status","queued_at");--> statement-breakpoint
CREATE INDEX "live_chats_agent_idx" ON "live_chats" USING btree ("assigned_agent_id","status");--> statement-breakpoint
CREATE INDEX "live_chats_user_idx" ON "live_chats" USING btree ("user_id","status");--> statement-breakpoint
-- Give the ready-made roles that answer customers the new Live chat area (and Admin everything).
UPDATE "roles" SET "permissions" = array_append("permissions", 'livechat') WHERE "is_system" AND "name" IN ('Admin', 'Operations', 'Support agent') AND NOT ('livechat' = ANY("permissions"));
