-- ============================================
-- Migration 015: Add barcode column to web_products
-- Gaurav Softwares - Jewelry Estimation
-- ============================================
-- Run: npm run migrate
-- ============================================
-- Adds an explicit barcode column so ERP payloads
-- can store the raw barcode independently of the
-- sku unique-key column.
-- ============================================

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'web_products' AND column_name = 'barcode'
    ) THEN
        ALTER TABLE web_products ADD COLUMN barcode VARCHAR(255);
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_web_products_barcode ON web_products(barcode);

DO $$
BEGIN
    RAISE NOTICE '✅ Migration 015 completed: barcode column added to web_products';
END $$;
