-- ============================================
-- Migration 021: Diamond specifications and certificate for web_products
-- Gaurav Softwares - Jewelry Estimation
-- ============================================
-- Run: npm run migrate
-- ============================================
-- Diamond enrichment: Carat, Cut, Color, Clarity, Certificate URL
-- Used only when metal_type is 'diamond' or 'diamonds'
-- ============================================

ALTER TABLE web_products ADD COLUMN IF NOT EXISTS diamond_carat VARCHAR(50);
ALTER TABLE web_products ADD COLUMN IF NOT EXISTS diamond_cut VARCHAR(100);
ALTER TABLE web_products ADD COLUMN IF NOT EXISTS diamond_color VARCHAR(100);
ALTER TABLE web_products ADD COLUMN IF NOT EXISTS diamond_clarity VARCHAR(100);
ALTER TABLE web_products ADD COLUMN IF NOT EXISTS certificate_url VARCHAR(500);

DO $$
BEGIN
    RAISE NOTICE '✅ Migration 021 completed: diamond specifications and certificate_url added to web_products';
END $$;
