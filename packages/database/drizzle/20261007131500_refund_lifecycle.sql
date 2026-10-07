DO $$ BEGIN
  CREATE TYPE refund_status AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE refunds
  ADD COLUMN IF NOT EXISTS status refund_status NOT NULL DEFAULT 'PENDING',
  ADD COLUMN IF NOT EXISTS idempotency_key text;

UPDATE refunds
SET idempotency_key = 'legacy_' || id
WHERE idempotency_key IS NULL;

ALTER TABLE refunds
  ALTER COLUMN idempotency_key SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS refunds_idempotency_key_unique
  ON refunds (idempotency_key);
