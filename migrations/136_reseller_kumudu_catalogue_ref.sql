-- Migration 136: Kumudu external catalogue id on sync records (product → catalogue link)

ALTER TABLE reseller_kumudu_sync_records
    ADD COLUMN IF NOT EXISTS kumudu_catalogue_ref VARCHAR(128);

CREATE INDEX IF NOT EXISTS idx_reseller_kumudu_sync_kumudu_cat
    ON reseller_kumudu_sync_records (reseller_user_id, kumudu_catalogue_ref)
    WHERE kumudu_catalogue_ref IS NOT NULL;

DO $$
BEGIN
    RAISE NOTICE '✅ Migration 136: kumudu_catalogue_ref on sync records';
END $$;
