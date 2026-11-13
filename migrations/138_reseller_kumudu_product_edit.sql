-- Migration 138: Kumudu product_edit mapping + sample payload

ALTER TABLE reseller_kumudu_link
    ADD COLUMN IF NOT EXISTS product_edit_mapping JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE reseller_kumudu_link
    ADD COLUMN IF NOT EXISTS sample_product_edit_payload JSONB;

ALTER TABLE reseller_kumudu_link
    ADD COLUMN IF NOT EXISTS last_product_edit_at TIMESTAMPTZ;

DO $$
BEGIN
    RAISE NOTICE '✅ Migration 138: reseller_kumudu_link product_edit';
END $$;
