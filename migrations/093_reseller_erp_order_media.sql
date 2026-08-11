-- Order-level media (photos + voice) for ERP order bills
ALTER TABLE reseller_erp_bills
    ADD COLUMN IF NOT EXISTS order_media_json JSONB NOT NULL DEFAULT '{"imageUrls":[],"voiceNoteUrl":null}'::jsonb;
