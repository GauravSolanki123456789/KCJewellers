-- Per-reseller metal rates (silver + gold 18K/22K/24K per gram) for vanity storefronts.
-- Admin enables via users.reseller_rates_update_enabled (B2B → Edit reseller).

ALTER TABLE users
    ADD COLUMN IF NOT EXISTS reseller_rates_update_enabled BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS reseller_metal_rates (
    user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    silver_per_gram NUMERIC(12, 2) NOT NULL,
    gold_24k_per_gram NUMERIC(12, 2) NOT NULL,
    gold_22k_per_gram NUMERIC(12, 2) NOT NULL,
    gold_18k_per_gram NUMERIC(12, 2) NOT NULL,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_reseller_metal_rates_updated
    ON reseller_metal_rates (updated_at DESC);
