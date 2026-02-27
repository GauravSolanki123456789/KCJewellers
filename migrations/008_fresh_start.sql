-- ============================================
-- Migration 008: Fresh Start - Wipe Web Sync Data
-- Gaurav Softwares - Jewelry Estimation
-- ============================================
-- Run: npm run migrate
-- ============================================
-- Truncates all synced products from ERP. Use before re-sync.
-- ============================================

-- Truncate in dependency order (child tables first)
-- CASCADE handles any tables referencing these
TRUNCATE TABLE web_products, web_subcategories, web_categories CASCADE;

-- ============================================
-- VERIFY
-- ============================================
DO $$ 
BEGIN
    RAISE NOTICE '✅ Migration 008 completed: Web sync tables truncated (0 products)';
END $$;
