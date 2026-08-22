-- DigiGold / DigiSilver admin toggles + chit scheme definitions per reseller
ALTER TABLE users
    ADD COLUMN IF NOT EXISTS reseller_digigold_enabled BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS reseller_digisilver_enabled BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS reseller_digi_schemes (
    id SERIAL PRIMARY KEY,
    reseller_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    product_type VARCHAR(16) NOT NULL CHECK (product_type IN ('gold', 'silver')),
    scheme_name VARCHAR(255) NOT NULL,
    description TEXT,
    installment_inr NUMERIC(12, 2),
    duration_months INTEGER,
    bonus_months INTEGER NOT NULL DEFAULT 0,
    bonus_description TEXT,
    metal_key VARCHAR(24),
    is_active BOOLEAN NOT NULL DEFAULT true,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_reseller_digi_schemes_reseller
    ON reseller_digi_schemes (reseller_user_id, product_type, is_active);

ALTER TABLE reseller_digi_orders
    ADD COLUMN IF NOT EXISTS source VARCHAR(20) NOT NULL DEFAULT 'razorpay',
    ADD COLUMN IF NOT EXISTS scheme_id INTEGER REFERENCES reseller_digi_schemes(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS payment_mode VARCHAR(32),
    ADD COLUMN IF NOT EXISTS reference_no VARCHAR(128),
    ADD COLUMN IF NOT EXISTS notes TEXT,
    ADD COLUMN IF NOT EXISTS recorded_by INTEGER REFERENCES users(id) ON DELETE SET NULL;

DO $$
BEGIN
    RAISE NOTICE '✅ Migration 099 completed: reseller digi toggles + schemes + manual order fields';
END $$;
