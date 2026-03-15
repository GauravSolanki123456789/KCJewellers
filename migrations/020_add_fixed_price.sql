-- ============================================
-- Migration 020: Add fixed_price and stone_charges to web_products for Diamond jewelry
-- Gaurav Softwares - Jewelry Estimation
-- ============================================
-- Run: npm run migrate
-- ============================================
-- fixed_price: Used when metal_type is 'diamond'/'diamonds' — bypasses live rate calculation
-- stone_charges: Additional stone charges for diamond products (mc_rate + stone_charges = fallback when fixed_price not set)
-- metal_type: VARCHAR(50) supports Gold, Silver, Diamond, Platinum (no enum constraint)
-- ============================================

ALTER TABLE web_products ADD COLUMN IF NOT EXISTS fixed_price NUMERIC(12,2) DEFAULT 0;
ALTER TABLE web_products ADD COLUMN IF NOT EXISTS stone_charges NUMERIC(12,2) DEFAULT 0;

-- Index for products that use fixed pricing (optional, for future queries)
CREATE INDEX IF NOT EXISTS idx_web_products_metal_type ON web_products(metal_type);

DO $$
BEGIN
    RAISE NOTICE '✅ Migration 020 completed: fixed_price and stone_charges columns added to web_products';
END $$;
