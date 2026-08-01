-- Migration 077: DigiGold/DigiSilver per-reseller Razorpay, discounts, holdings & orders

ALTER TABLE users
    ADD COLUMN IF NOT EXISTS reseller_razorpay_key_id VARCHAR(128),
    ADD COLUMN IF NOT EXISTS reseller_razorpay_key_secret TEXT;

ALTER TABLE reseller_metal_rates
    ADD COLUMN IF NOT EXISTS digi_silver_discount_inr NUMERIC(12, 2) NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS digi_gold_24k_discount_inr NUMERIC(12, 2) NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS digi_gold_22k_discount_inr NUMERIC(12, 2) NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS digi_gold_18k_discount_inr NUMERIC(12, 2) NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS reseller_digi_holdings (
    id SERIAL PRIMARY KEY,
    reseller_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    customer_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    metal_key VARCHAR(24) NOT NULL,
    balance_grams NUMERIC(14, 6) NOT NULL DEFAULT 0,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (reseller_user_id, customer_user_id, metal_key)
);

CREATE INDEX IF NOT EXISTS idx_reseller_digi_holdings_reseller
    ON reseller_digi_holdings (reseller_user_id, customer_user_id);

CREATE TABLE IF NOT EXISTS reseller_digi_orders (
    id SERIAL PRIMARY KEY,
    reseller_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    customer_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    metal_key VARCHAR(24) NOT NULL,
    amount_inr NUMERIC(12, 2) NOT NULL,
    retail_rate_per_gram NUMERIC(12, 2) NOT NULL,
    discount_inr NUMERIC(12, 2) NOT NULL DEFAULT 0,
    effective_rate_per_gram NUMERIC(12, 2) NOT NULL,
    grams NUMERIC(14, 6) NOT NULL,
    razorpay_order_id VARCHAR(64),
    razorpay_payment_id VARCHAR(64),
    status VARCHAR(20) NOT NULL DEFAULT 'pending',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    paid_at TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_reseller_digi_orders_reseller_status
    ON reseller_digi_orders (reseller_user_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_reseller_digi_orders_razorpay
    ON reseller_digi_orders (razorpay_order_id)
    WHERE razorpay_order_id IS NOT NULL;

DO $$
BEGIN
    RAISE NOTICE '✅ Migration 077 completed: reseller digi payments, discounts, holdings & orders';
END $$;
