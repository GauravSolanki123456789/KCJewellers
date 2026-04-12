-- B2B wholesale: customer_tier + wholesale discount fields + client ledger (Khata)
-- Consistent naming: customer_tier, wholesale_making_charge_discount_percent, wholesale_markup_percent

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'users' AND column_name = 'customer_tier'
    ) THEN
        ALTER TABLE users ADD COLUMN customer_tier VARCHAR(32) NOT NULL DEFAULT 'B2C_CUSTOMER';
        ALTER TABLE users ADD CONSTRAINT users_customer_tier_check
            CHECK (customer_tier IN ('ADMIN', 'B2C_CUSTOMER', 'B2B_WHOLESALE'));
        RAISE NOTICE 'Added customer_tier';
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'users' AND column_name = 'wholesale_making_charge_discount_percent'
    ) THEN
        ALTER TABLE users ADD COLUMN wholesale_making_charge_discount_percent NUMERIC(8,4) NOT NULL DEFAULT 0;
        RAISE NOTICE 'Added wholesale_making_charge_discount_percent';
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'users' AND column_name = 'wholesale_markup_percent'
    ) THEN
        ALTER TABLE users ADD COLUMN wholesale_markup_percent NUMERIC(8,4) NOT NULL DEFAULT 0;
        RAISE NOTICE 'Added wholesale_markup_percent';
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'users' AND column_name = 'b2b_linked_customer_id'
    ) THEN
        ALTER TABLE users ADD COLUMN b2b_linked_customer_id INTEGER REFERENCES customers(id) ON DELETE SET NULL;
        CREATE INDEX IF NOT EXISTS idx_users_b2b_linked_customer ON users(b2b_linked_customer_id) WHERE b2b_linked_customer_id IS NOT NULL;
        RAISE NOTICE 'Added b2b_linked_customer_id';
    END IF;
END $$;

CREATE TABLE IF NOT EXISTS b2b_client_ledger_entries (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    txn_category VARCHAR(32) NOT NULL,
    amount_rupees NUMERIC(16,2) NOT NULL DEFAULT 0,
    fine_metal_grams NUMERIC(16,6) NOT NULL DEFAULT 0,
    metal_type VARCHAR(32) DEFAULT 'gold',
    description TEXT,
    reference VARCHAR(128),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT b2b_ledger_txn_category_check CHECK (
        txn_category IN ('PURCHASE', 'CASH_PAYMENT', 'METAL_DEPOSIT')
    )
);

CREATE INDEX IF NOT EXISTS idx_b2b_ledger_user_created ON b2b_client_ledger_entries(user_id, created_at DESC);
