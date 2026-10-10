CREATE TYPE "seller_tax_identity_type" AS ENUM ('GSTIN', 'ENROLMENT_ID');--> statement-breakpoint

ALTER TABLE "sellers"
  ADD COLUMN "tax_identity_type" "seller_tax_identity_type" DEFAULT 'GSTIN' NOT NULL,
  ADD COLUMN "gst_enrolment_id" text,
  ADD COLUMN "business_state" text;--> statement-breakpoint

CREATE UNIQUE INDEX "sellers_gst_enrolment_id_unique"
  ON "sellers" USING btree ("gst_enrolment_id")
  WHERE "gst_enrolment_id" IS NOT NULL;--> statement-breakpoint

ALTER TYPE "document_type" ADD VALUE 'GST_ENROLMENT';
