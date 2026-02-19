-- ============================================
-- Migration 005: Nested Categories & Wallet
-- Gaurav Softwares - Jewelry Estimation
-- ============================================
-- Run: npm run migrate
-- ============================================

DO $$
BEGIN
    -- ============================================
    -- CATEGORIES TABLE (Self-referencing)
    -- ============================================
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'categories') THEN
        CREATE TABLE categories (
            id SERIAL PRIMARY KEY,
            name VARCHAR(120) NOT NULL,
            slug VARCHAR(160) NOT NULL UNIQUE,
            parent_id INTEGER REFERENCES categories(id) ON DELETE CASCADE,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        CREATE INDEX IF NOT EXISTS idx_categories_parent ON categories(parent_id);
        CREATE UNIQUE INDEX IF NOT EXISTS idx_categories_slug_lower ON categories(LOWER(slug));
    END IF;

    -- ============================================
    -- PRODUCTS: Link to category and jewelry attributes
    -- Safe, additive changes only
    -- ============================================
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'products' AND column_name = 'category_id'
    ) THEN
        ALTER TABLE products ADD COLUMN category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL;
        CREATE INDEX IF NOT EXISTS idx_products_category_id ON products(category_id);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'products' AND column_name = 'gross_weight'
    ) THEN
        ALTER TABLE products ADD COLUMN gross_weight NUMERIC(12,3);
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'products' AND column_name = 'net_weight'
    ) THEN
        ALTER TABLE products ADD COLUMN net_weight NUMERIC(12,3);
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'products' AND column_name = 'making_charges'
    ) THEN
        ALTER TABLE products ADD COLUMN making_charges NUMERIC(12,2);
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'products' AND column_name = 'making_charges_type'
    ) THEN
        ALTER TABLE products ADD COLUMN making_charges_type VARCHAR(20);
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'products' AND column_name = 'gst_percentage'
    ) THEN
        ALTER TABLE products ADD COLUMN gst_percentage NUMERIC(5,2);
    END IF;
    -- Ensure existing columns are present with correct types
    -- stone_charges exists in older schema; leave as-is

    -- ============================================
    -- SIP & WALLET: Dedicated wallet table (optional alongside users.wallet_gold_balance)
    -- ============================================
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'user_gold_wallet') THEN
        CREATE TABLE user_gold_wallet (
            user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
            balance_grams NUMERIC(14,6) NOT NULL DEFAULT 0,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
    END IF;

    -- Ensure SIP tables exist if Migration 004 not executed
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'sip_plans') THEN
        CREATE TABLE sip_plans (
            id SERIAL PRIMARY KEY,
            name VARCHAR(100) NOT NULL,
            type VARCHAR(20) NOT NULL CHECK (type IN ('DAILY','MONTHLY')),
            min_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
            duration_months INTEGER NOT NULL,
            is_active BOOLEAN DEFAULT true,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        CREATE UNIQUE INDEX IF NOT EXISTS idx_sip_plans_name ON sip_plans(name);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'sip_transactions') THEN
        CREATE TABLE sip_transactions (
            id BIGSERIAL PRIMARY KEY,
            user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
            plan_id INTEGER REFERENCES sip_plans(id) ON DELETE SET NULL,
            amount NUMERIC(12,2) NOT NULL,
            gold_rate_at_time NUMERIC(12,2),
            gold_credited NUMERIC(12,4),
            status VARCHAR(20) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','SUCCESS','FAILED','REFUNDED')),
            transaction_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        CREATE INDEX IF NOT EXISTS idx_sip_tx_user ON sip_transactions(user_id);
        CREATE INDEX IF NOT EXISTS idx_sip_tx_plan ON sip_transactions(plan_id);
        CREATE INDEX IF NOT EXISTS idx_sip_tx_status ON sip_transactions(status);
        CREATE INDEX IF NOT EXISTS idx_sip_tx_date ON sip_transactions(transaction_date);
    END IF;
END $$;

DO $$
BEGIN
    RAISE NOTICE '✅ Migration 005 completed: Nested categories, product attributes, and wallet table added';
END $$;

