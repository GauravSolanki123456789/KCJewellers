-- ============================================
-- Migration 029: B2B wholesale customer roles, discount tier, ledger (Khata)
-- ============================================

-- Wholesale discount tier: % off making charges + % markup on metal (can be negative)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'users' AND column_name = 'mc_discount_percent'
    ) THEN
        ALTER TABLE users ADD COLUMN mc_discount_percent NUMERIC(6,3) DEFAULT 0;
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'users' AND column_name = 'metal_markup_percent'
    ) THEN
        ALTER TABLE users ADD COLUMN metal_markup_percent NUMERIC(6,3) DEFAULT 0;
    END IF;
END $$;

-- Outstanding balances for B2B ledger (Khata)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'users' AND column_name = 'ledger_rupee_balance'
    ) THEN
        ALTER TABLE users ADD COLUMN ledger_rupee_balance NUMERIC(14,2) DEFAULT 0 NOT NULL;
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'users' AND column_name = 'ledger_fine_metal_grams'
    ) THEN
        ALTER TABLE users ADD COLUMN ledger_fine_metal_grams NUMERIC(14,6) DEFAULT 0 NOT NULL;
    END IF;
END $$;

-- Normalize retail customer role (do not touch ERP roles: super_admin, admin, employee)
UPDATE users
SET role = 'B2C_CUSTOMER'
WHERE role IN ('customer')
  AND COALESCE(email, '') <> 'jaigaurav56789@gmail.com';

-- Optional: map legacy admin string to ADMIN for storefront-facing enum (ERP admins may stay employee — only if was 'customer' already handled)
-- super_admin unchanged

CREATE TABLE IF NOT EXISTS user_ledger_entries (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    entry_type VARCHAR(32) NOT NULL CHECK (entry_type IN ('PURCHASE', 'CASH_PAYMENT', 'METAL_DEPOSIT')),
    rupee_delta NUMERIC(14,2) DEFAULT 0 NOT NULL,
    fine_metal_delta_grams NUMERIC(14,6) DEFAULT 0 NOT NULL,
    metal_type VARCHAR(32),
    description TEXT,
    reference VARCHAR(128),
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_user_ledger_entries_user_id ON user_ledger_entries(user_id);
CREATE INDEX IF NOT EXISTS idx_user_ledger_entries_created_at ON user_ledger_entries(created_at DESC);

-- Pre-approved B2B logins: match email or mobile on sign-in
CREATE TABLE IF NOT EXISTS b2b_whitelist (
    id SERIAL PRIMARY KEY,
    email_norm VARCHAR(255),
    mobile_last10 VARCHAR(10),
    default_mc_discount_percent NUMERIC(6,3) DEFAULT 0,
    default_metal_markup_percent NUMERIC(6,3) DEFAULT 0,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_b2b_whitelist_email
    ON b2b_whitelist(email_norm) WHERE email_norm IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_b2b_whitelist_mobile
    ON b2b_whitelist(mobile_last10) WHERE mobile_last10 IS NOT NULL;
