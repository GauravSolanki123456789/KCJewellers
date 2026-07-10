-- Reseller / admin workflow status on shared catalogue WhatsApp & PDF inquiries
ALTER TABLE shared_catalog_inquiries
  ADD COLUMN IF NOT EXISTS inquiry_status VARCHAR(24) NOT NULL DEFAULT 'pending';

ALTER TABLE shared_catalog_inquiries
  ADD COLUMN IF NOT EXISTS status_updated_at TIMESTAMPTZ;

ALTER TABLE shared_catalog_inquiries
  ADD COLUMN IF NOT EXISTS status_note TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'shared_catalog_inquiries_status_check'
  ) THEN
    ALTER TABLE shared_catalog_inquiries
      ADD CONSTRAINT shared_catalog_inquiries_status_check
      CHECK (inquiry_status IN ('pending', 'completed', 'no_sale'));
  END IF;
END $$;

COMMENT ON COLUMN shared_catalog_inquiries.inquiry_status IS
  'pending = new quote; completed = sale happened; no_sale = excluded from quoted/sales totals.';

CREATE INDEX IF NOT EXISTS idx_shared_catalog_inquiries_status_created
  ON shared_catalog_inquiries (inquiry_status, created_at DESC);
