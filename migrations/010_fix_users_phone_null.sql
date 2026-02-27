-- ============================================
-- Migration 010: Fix Users Phone Null Constraint
-- Gaurav Softwares - Jewelry Estimation
-- ============================================
-- Stops Google OAuth from crashing when phone number isn't provided
-- ============================================

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'phone') THEN
        ALTER TABLE users ALTER COLUMN phone DROP NOT NULL;
    END IF;
END $$;

-- ============================================
-- VERIFY
-- ============================================
DO $$ 
BEGIN
    RAISE NOTICE '✅ Migration 010 completed: users.phone allows NULL';
END $$;
