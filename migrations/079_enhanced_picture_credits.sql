-- Migration 079: Enhanced Picture credits, plans, payment settings, job aspect/text

ALTER TABLE users
    ADD COLUMN IF NOT EXISTS reseller_enhanced_picture_credits INTEGER NOT NULL DEFAULT 4,
    ADD COLUMN IF NOT EXISTS reseller_enhanced_razorpay_enabled BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS reseller_enhanced_payment_qr_url TEXT,
    ADD COLUMN IF NOT EXISTS reseller_enhanced_bank_details TEXT;

COMMENT ON COLUMN users.reseller_enhanced_picture_credits IS
    'Remaining AI studio image credits (1 credit = 1 generation). Admin-controlled; new accounts start at 4.';

ALTER TABLE reseller_enhanced_picture_jobs
    ADD COLUMN IF NOT EXISTS aspect_ratio VARCHAR(16) NOT NULL DEFAULT '1:1',
    ADD COLUMN IF NOT EXISTS canvas_text TEXT,
    ADD COLUMN IF NOT EXISTS download_filename VARCHAR(255);

CREATE TABLE IF NOT EXISTS reseller_enhanced_credit_plans (
    id SERIAL PRIMARY KEY,
    reseller_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(120) NOT NULL,
    credits INTEGER NOT NULL,
    price_inr NUMERIC(12, 2) NOT NULL,
    sort_order INTEGER NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_reseller_enhanced_credit_plans_user
    ON reseller_enhanced_credit_plans (reseller_user_id, sort_order, id);

CREATE TABLE IF NOT EXISTS reseller_enhanced_credit_ledger (
    id SERIAL PRIMARY KEY,
    reseller_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    delta INTEGER NOT NULL,
    balance_after INTEGER NOT NULL,
    reason VARCHAR(64) NOT NULL,
    note TEXT,
    created_by_admin_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_reseller_enhanced_credit_ledger_user
    ON reseller_enhanced_credit_ledger (reseller_user_id, created_at DESC);

DO $$
BEGIN
    RAISE NOTICE '✅ Migration 079 completed: enhanced picture credits, plans, payment settings';
END $$;
