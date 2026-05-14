-- 001_add_business_status.sql
-- Adds soft-delete and verification tracking to the gyms table.
-- Idempotent: safe to run multiple times.

BEGIN;

ALTER TABLE gyms ADD COLUMN IF NOT EXISTS business_status text NOT NULL DEFAULT 'OPERATIONAL';
ALTER TABLE gyms ADD COLUMN IF NOT EXISTS closed_at timestamptz;
ALTER TABLE gyms ADD COLUMN IF NOT EXISTS last_verified_at timestamptz;
ALTER TABLE gyms ADD COLUMN IF NOT EXISTS verification_source text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'gyms_business_status_chk'
  ) THEN
    ALTER TABLE gyms ADD CONSTRAINT gyms_business_status_chk
      CHECK (business_status IN ('OPERATIONAL', 'CLOSED_PERMANENTLY', 'UNVERIFIED'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS gyms_business_status_idx ON gyms (business_status);

COMMIT;
