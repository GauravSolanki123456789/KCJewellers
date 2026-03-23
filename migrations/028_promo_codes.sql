-- ============================================
-- Migration 028: Promo Codes & Offers Engine
-- Gaurav Softwares - KC Jewellers
-- ============================================
-- Run: npm run migrate
-- ============================================
-- Promo codes for marketing campaigns: fixed_amount, percentage, free_shipping
-- ============================================

CREATE TABLE IF NOT EXISTS promo_codes (
    id SERIAL PRIMARY KEY,
    code VARCHAR(50) NOT NULL UNIQUE,
    discount_type VARCHAR(30) NOT NULL CHECK (discount_type IN ('fixed_amount', 'percentage', 'free_shipping')),
    discount_value NUMERIC(12,2) NOT NULL DEFAULT 0,
    min_order_value NUMERIC(12,2),
    max_uses INTEGER,
    current_uses INTEGER NOT NULL DEFAULT 0,
    expires_at TIMESTAMP,
    is_active BOOLEAN NOT NULL DEFAULT true,
    description VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_promo_codes_code ON promo_codes(LOWER(code));
CREATE INDEX IF NOT EXISTS idx_promo_codes_is_active ON promo_codes(is_active);
CREATE INDEX IF NOT EXISTS idx_promo_codes_expires_at ON promo_codes(expires_at) WHERE expires_at IS NOT NULL;

-- Add promo columns to orders (for order history & analytics)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'orders' AND column_name = 'promo_code_id') THEN
        ALTER TABLE orders ADD COLUMN promo_code_id INTEGER REFERENCES promo_codes(id) ON DELETE SET NULL;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'orders' AND column_name = 'promo_discount_amount') THEN
        ALTER TABLE orders ADD COLUMN promo_discount_amount NUMERIC(12,2) DEFAULT 0;
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_orders_promo_code ON orders(promo_code_id) WHERE promo_code_id IS NOT NULL;

-- ============================================
DO $$
BEGIN
    RAISE NOTICE '✅ Migration 028 completed: promo_codes table and orders promo columns';
END $$;
