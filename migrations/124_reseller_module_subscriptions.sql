-- Per-reseller website/catalogue and ERP subscription windows + optional free trial.
-- Empty dates = unlimited (existing resellers keep working). Inclusive DATE in Asia/Kolkata.

ALTER TABLE users
    ADD COLUMN IF NOT EXISTS reseller_website_from_date DATE,
    ADD COLUMN IF NOT EXISTS reseller_website_to_date DATE,
    ADD COLUMN IF NOT EXISTS reseller_website_trial_enabled BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS reseller_website_trial_from_date DATE,
    ADD COLUMN IF NOT EXISTS reseller_website_trial_to_date DATE,
    ADD COLUMN IF NOT EXISTS reseller_erp_from_date DATE,
    ADD COLUMN IF NOT EXISTS reseller_erp_to_date DATE,
    ADD COLUMN IF NOT EXISTS reseller_erp_trial_enabled BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS reseller_erp_trial_from_date DATE,
    ADD COLUMN IF NOT EXISTS reseller_erp_trial_to_date DATE;

DO $$ BEGIN
    RAISE NOTICE '✅ Migration 124: reseller website + ERP subscription dates';
END $$;
