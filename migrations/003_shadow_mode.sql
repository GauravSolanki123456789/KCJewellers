-- ============================================
-- Migration 003: Shadow Mode (Number 2) Support
-- Gaurav Softwares - Jewelry Estimation
-- ============================================
-- Run: psql -U postgres -d jewelry_db -f migrations/003_shadow_mode.sql
-- ============================================

-- ============================================
-- ADD bill_type COLUMN TO quotations TABLE
-- ============================================

DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'quotations' AND column_name = 'bill_type'
    ) THEN
        ALTER TABLE quotations ADD COLUMN bill_type VARCHAR(20) DEFAULT 'TAX';
        RAISE NOTICE '✅ Added bill_type column to quotations table';
    ELSE
        RAISE NOTICE '⚠️ bill_type column already exists';
    END IF;
END $$;

-- ============================================
-- UPDATE EXISTING QUOTATIONS TO DEFAULT 'TAX'
-- ============================================

UPDATE quotations 
SET bill_type = 'TAX' 
WHERE bill_type IS NULL;

-- ============================================
-- CREATE INDEX FOR PERFORMANCE
-- ============================================

CREATE INDEX IF NOT EXISTS idx_quotations_bill_type ON quotations(bill_type);
CREATE INDEX IF NOT EXISTS idx_quotations_bill_type_deleted ON quotations(bill_type, is_deleted) WHERE is_deleted = false;

-- ============================================
-- VERIFY MIGRATION
-- ============================================

DO $$ 
BEGIN
    RAISE NOTICE '✅ Migration 003 completed: Shadow Mode support added';
    RAISE NOTICE 'bill_type column added with default value ''TAX''';
    RAISE NOTICE 'Existing quotations set to ''TAX''';
END $$;
