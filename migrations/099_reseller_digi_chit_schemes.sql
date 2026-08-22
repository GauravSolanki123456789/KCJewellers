-- Admin toggles for DigiGold / DigiSilver ERP modules + chit scheme tracking

ALTER TABLE users
    ADD COLUMN IF NOT EXISTS reseller_digigold_enabled BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS reseller_digisilver_enabled BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS reseller_chit_schemes (
    id SERIAL PRIMARY KEY,
    reseller_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    product_line VARCHAR(16) NOT NULL,
    name VARCHAR(255) NOT NULL,
    scheme_type VARCHAR(32) NOT NULL DEFAULT 'monthly_chit',
    description TEXT,
    monthly_amount_inr NUMERIC(12, 2),
    duration_months INTEGER,
    metal_key VARCHAR(24),
    bonus_pct NUMERIC(5, 2) NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_reseller_chit_schemes_reseller
    ON reseller_chit_schemes (reseller_user_id, product_line, is_active);

CREATE TABLE IF NOT EXISTS reseller_chit_members (
    id SERIAL PRIMARY KEY,
    scheme_id INTEGER NOT NULL REFERENCES reseller_chit_schemes(id) ON DELETE CASCADE,
    reseller_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    customer_name VARCHAR(255) NOT NULL,
    customer_mobile VARCHAR(16),
    customer_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'active',
    enrolled_at DATE NOT NULL DEFAULT CURRENT_DATE,
    target_amount_inr NUMERIC(12, 2),
    notes TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_reseller_chit_members_scheme
    ON reseller_chit_members (scheme_id, status);

CREATE TABLE IF NOT EXISTS reseller_chit_transactions (
    id SERIAL PRIMARY KEY,
    scheme_id INTEGER NOT NULL REFERENCES reseller_chit_schemes(id) ON DELETE CASCADE,
    member_id INTEGER NOT NULL REFERENCES reseller_chit_members(id) ON DELETE CASCADE,
    reseller_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    txn_type VARCHAR(20) NOT NULL DEFAULT 'payment',
    amount_inr NUMERIC(12, 2) NOT NULL DEFAULT 0,
    grams NUMERIC(14, 6) NOT NULL DEFAULT 0,
    metal_key VARCHAR(24),
    rate_per_gram NUMERIC(12, 2),
    payment_mode VARCHAR(24) NOT NULL DEFAULT 'cash',
    reference_no VARCHAR(128),
    notes TEXT,
    txn_date DATE NOT NULL DEFAULT CURRENT_DATE,
    created_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_reseller_chit_txn_reseller_date
    ON reseller_chit_transactions (reseller_user_id, txn_date DESC);

ALTER TABLE reseller_digi_orders
    ADD COLUMN IF NOT EXISTS source VARCHAR(24) NOT NULL DEFAULT 'razorpay',
    ADD COLUMN IF NOT EXISTS payment_mode VARCHAR(24),
    ADD COLUMN IF NOT EXISTS reference_no VARCHAR(128),
    ADD COLUMN IF NOT EXISTS notes TEXT,
    ADD COLUMN IF NOT EXISTS customer_name_manual VARCHAR(255),
    ADD COLUMN IF NOT EXISTS customer_mobile_manual VARCHAR(16);
