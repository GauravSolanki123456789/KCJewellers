-- ============================================
-- Migration 004: E-commerce & SIP Support
-- Gaurav Softwares - Jewelry Estimation
-- ============================================
-- Run: npm run migrate
-- ============================================

-- ============================================
-- USERS: Add E-commerce fields (safe upgrade)
-- ============================================
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'users' AND column_name = 'phone'
    ) THEN
        ALTER TABLE users ADD COLUMN phone VARCHAR(20);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'users' AND column_name = 'password_hash'
    ) THEN
        ALTER TABLE users ADD COLUMN password_hash VARCHAR(255);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'users' AND column_name = 'kyc_status'
    ) THEN
        ALTER TABLE users ADD COLUMN kyc_status VARCHAR(20) DEFAULT 'pending';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'users' AND column_name = 'wallet_gold_balance'
    ) THEN
        ALTER TABLE users ADD COLUMN wallet_gold_balance NUMERIC(14,3) DEFAULT 0;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'users' AND column_name = 'wallet_silver_balance'
    ) THEN
        ALTER TABLE users ADD COLUMN wallet_silver_balance NUMERIC(14,3) DEFAULT 0;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'users' AND column_name = 'created_at'
    ) THEN
        ALTER TABLE users ADD COLUMN created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
    END IF;
END $$;

-- ============================================
-- Helper: Determine type of users.id (uuid or integer)
-- ============================================
DO $$
DECLARE
    id_type TEXT;
BEGIN
    SELECT data_type INTO id_type
    FROM information_schema.columns
    WHERE table_name = 'users' AND column_name = 'id';

    IF id_type IS NULL THEN
        RAISE NOTICE 'users.id type not found, defaulting to UUID for FKs';
        id_type := 'uuid';
    END IF;

    -- ============================================
    -- ADDRESSES TABLE
    -- ============================================
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'addresses') THEN
        IF id_type = 'uuid' THEN
            EXECUTE $sql$
                CREATE TABLE addresses (
                    id SERIAL PRIMARY KEY,
                    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
                    line1 TEXT NOT NULL,
                    city VARCHAR(100),
                    pincode VARCHAR(10),
                    type VARCHAR(20) DEFAULT 'HOME' CHECK (type IN ('HOME','WORK','OTHER')),
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            $sql$;
        ELSE
            EXECUTE $sql$
                CREATE TABLE addresses (
                    id SERIAL PRIMARY KEY,
                    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
                    line1 TEXT NOT NULL,
                    city VARCHAR(100),
                    pincode VARCHAR(10),
                    type VARCHAR(20) DEFAULT 'HOME' CHECK (type IN ('HOME','WORK','OTHER')),
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            $sql$;
        END IF;
        PERFORM 1;
        CREATE INDEX IF NOT EXISTS idx_addresses_user ON addresses(user_id);
        CREATE INDEX IF NOT EXISTS idx_addresses_city ON addresses(city);
    END IF;

    -- ============================================
    -- ORDERS TABLE
    -- ============================================
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'orders') THEN
        IF id_type = 'uuid' THEN
            EXECUTE $sql$
                CREATE TABLE orders (
                    id BIGSERIAL PRIMARY KEY,
                    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
                    total_amount NUMERIC(12,2) DEFAULT 0,
                    payment_status VARCHAR(20) DEFAULT 'PENDING',
                    payment_method VARCHAR(20),
                    razorpay_order_id VARCHAR(100),
                    delivery_status VARCHAR(20) DEFAULT 'PENDING',
                    items_snapshot_json JSONB,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            $sql$;
        ELSE
            EXECUTE $sql$
                CREATE TABLE orders (
                    id BIGSERIAL PRIMARY KEY,
                    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
                    total_amount NUMERIC(12,2) DEFAULT 0,
                    payment_status VARCHAR(20) DEFAULT 'PENDING',
                    payment_method VARCHAR(20),
                    razorpay_order_id VARCHAR(100),
                    delivery_status VARCHAR(20) DEFAULT 'PENDING',
                    items_snapshot_json JSONB,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            $sql$;
        END IF;
        PERFORM 1;
        CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_razorpay ON orders(razorpay_order_id);
        CREATE INDEX IF NOT EXISTS idx_orders_user ON orders(user_id);
        CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(payment_status, delivery_status);
    END IF;

    -- ============================================
    -- SIP_PLANS TABLE
    -- ============================================
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'sip_plans') THEN
        EXECUTE $sql$
            CREATE TABLE sip_plans (
                id SERIAL PRIMARY KEY,
                name VARCHAR(100) NOT NULL,
                type VARCHAR(20) NOT NULL CHECK (type IN ('DAILY','MONTHLY')),
                min_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
                duration_months INTEGER NOT NULL,
                is_active BOOLEAN DEFAULT true,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        $sql$;
        PERFORM 1;
        CREATE UNIQUE INDEX IF NOT EXISTS idx_sip_plans_name ON sip_plans(name);
    END IF;

    -- ============================================
    -- SIP_TRANSACTIONS TABLE
    -- ============================================
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'sip_transactions') THEN
        IF id_type = 'uuid' THEN
            EXECUTE $sql$
                CREATE TABLE sip_transactions (
                    id BIGSERIAL PRIMARY KEY,
                    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
                    plan_id INTEGER REFERENCES sip_plans(id) ON DELETE SET NULL,
                    amount NUMERIC(12,2) NOT NULL,
                    gold_rate_at_time NUMERIC(12,2),
                    gold_credited NUMERIC(12,4),
                    status VARCHAR(20) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','SUCCESS','FAILED','REFUNDED')),
                    transaction_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            $sql$;
        ELSE
            EXECUTE $sql$
                CREATE TABLE sip_transactions (
                    id BIGSERIAL PRIMARY KEY,
                    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
                    plan_id INTEGER REFERENCES sip_plans(id) ON DELETE SET NULL,
                    amount NUMERIC(12,2) NOT NULL,
                    gold_rate_at_time NUMERIC(12,2),
                    gold_credited NUMERIC(12,4),
                    status VARCHAR(20) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','SUCCESS','FAILED','REFUNDED')),
                    transaction_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            $sql$;
        END IF;
        PERFORM 1;
        CREATE INDEX IF NOT EXISTS idx_sip_tx_user ON sip_transactions(user_id);
        CREATE INDEX IF NOT EXISTS idx_sip_tx_plan ON sip_transactions(plan_id);
        CREATE INDEX IF NOT EXISTS idx_sip_tx_status ON sip_transactions(status);
        CREATE INDEX IF NOT EXISTS idx_sip_tx_date ON sip_transactions(transaction_date);
    END IF;
END $$;

-- ============================================
-- LIVE_RATES TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS live_rates (
    metal_type VARCHAR(20) PRIMARY KEY,
    buy_rate NUMERIC(12,2) NOT NULL,
    sell_rate NUMERIC(12,2) NOT NULL,
    admin_margin NUMERIC(12,2) DEFAULT 0,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_live_rates_metal CHECK (LOWER(metal_type) IN ('gold','silver','platinum'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_live_rates_metal ON live_rates(LOWER(metal_type));
CREATE INDEX IF NOT EXISTS idx_live_rates_updated ON live_rates(updated_at);

-- ============================================
-- Notices
-- ============================================
DO $$
BEGIN
    RAISE NOTICE '✅ Migration 004 completed: E-commerce & SIP tables added/updated';
END $$;
