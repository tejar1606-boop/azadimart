CREATE TABLE "seller_aadhaar" (
	"seller_id" uuid PRIMARY KEY NOT NULL,
	"status" text NOT NULL,
	"last4" text NOT NULL,
	"provider" text NOT NULL,
	"provider_ref" text,
	"otp_expires_at" timestamp with time zone,
	"otp_attempts" integer DEFAULT 0 NOT NULL,
	"consent_at" timestamp with time zone NOT NULL,
	"name_on_aadhaar" text,
	"year_of_birth" text,
	"state_on_aadhaar" text,
	"verified_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "seller_aadhaar" ADD CONSTRAINT "seller_aadhaar_seller_id_sellers_id_fk" FOREIGN KEY ("seller_id") REFERENCES "public"."sellers"("id") ON DELETE cascade ON UPDATE no action;