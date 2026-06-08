-- Migration 047: DigiGold/DigiSilver invest rates, shared catalogue discount, reseller invest staff
-- Keywords: digi_silver_per_gram, digi_gold_*_per_gram, discount_percentage (shared_catalogs), reseller_invest_manage_enabled

ALTER TABLE shared_catalogs
    ADD COLUMN IF NOT EXISTS discount_percentage DOUBLE PRECISION NOT NULL DEFAULT 0;

ALTER TABLE users
    ADD COLUMN IF NOT EXISTS reseller_invest_manage_enabled BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE reseller_metal_rates
    ADD COLUMN IF NOT EXISTS digi_silver_per_gram NUMERIC(12, 2),
    ADD COLUMN IF NOT EXISTS digi_gold_24k_per_gram NUMERIC(12, 2),
    ADD COLUMN IF NOT EXISTS digi_gold_22k_per_gram NUMERIC(12, 2),
    ADD COLUMN IF NOT EXISTS digi_gold_18k_per_gram NUMERIC(12, 2);

INSERT INTO app_settings (key, value, updated_at)
VALUES
    ('digi_silver_per_gram', '', CURRENT_TIMESTAMP),
    ('digi_gold_24k_per_gram', '', CURRENT_TIMESTAMP),
    ('digi_gold_22k_per_gram', '', CURRENT_TIMESTAMP),
    ('digi_gold_18k_per_gram', '', CURRENT_TIMESTAMP)
ON CONFLICT (key) DO NOTHING;

DO $$
BEGIN
    RAISE NOTICE '✅ Migration 047 completed: digi invest rates, shared_catalogs.discount_percentage, reseller_invest_manage_enabled';
END $$;
