-- ============================================
-- Migration 007: Add Quantity and Status to Web Products
-- Gaurav Softwares - Jewelry Estimation
-- ============================================
-- Run: npm run migrate
-- ============================================
-- Adds stock management columns for bi-directional sync
-- ============================================

-- ============================================
-- Add quantity column (Integer, Default 1)
-- ============================================
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'web_products' AND column_name = 'quantity'
    ) THEN
        ALTER TABLE web_products ADD COLUMN quantity INTEGER DEFAULT 1 NOT NULL;
    END IF;
END $$;

-- ============================================
-- Add status column (String, Default 'active')
-- ============================================
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'web_products' AND column_name = 'status'
    ) THEN
        ALTER TABLE web_products ADD COLUMN status VARCHAR(50) DEFAULT 'active' NOT NULL;
    END IF;
END $$;

-- ============================================
-- Add index on status for filtering
-- ============================================
CREATE INDEX IF NOT EXISTS idx_web_products_status ON web_products(status);

-- ============================================
-- Add index on quantity for stock queries
-- ============================================
CREATE INDEX IF NOT EXISTS idx_web_products_quantity ON web_products(quantity);
