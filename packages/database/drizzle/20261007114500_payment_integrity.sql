CREATE UNIQUE INDEX IF NOT EXISTS payments_provider_payment_unique
  ON payments (provider, provider_payment_id);--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS refunds_provider_refund_unique
  ON refunds (provider_refund_id);
