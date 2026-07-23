-- Idempotent inquiry logging: one row per client clickId (WhatsApp / PDF handoff).
ALTER TABLE shared_catalog_inquiries
    ADD COLUMN IF NOT EXISTS click_id VARCHAR(64);

CREATE UNIQUE INDEX IF NOT EXISTS idx_shared_catalog_inquiries_click_id
    ON shared_catalog_inquiries (click_id)
    WHERE click_id IS NOT NULL;
