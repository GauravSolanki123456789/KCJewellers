-- ============================================
-- Migration 023: OTP Authentication
-- Gaurav Softwares - KC Jewellers
-- ============================================
-- Adds otps table and allows users to be created with mobile_number only
-- ============================================

-- ============================================
-- OTPs TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS otps (
    id SERIAL PRIMARY KEY,
    mobile_number VARCHAR(20) NOT NULL,
    otp_code VARCHAR(10) NOT NULL,
    expires_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_otps_mobile_number ON otps(mobile_number);
CREATE INDEX IF NOT EXISTS idx_otps_expires_at ON otps(expires_at);

-- ============================================
-- USERS TABLE: Allow email NULL for mobile-only accounts
-- ============================================
-- Drop NOT NULL on email; mobile_number becomes primary identifier for OTP users
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'users' AND column_name = 'email'
    ) THEN
        ALTER TABLE users ALTER COLUMN email DROP NOT NULL;
    END IF;
END $$;

-- Ensure mobile_number exists (from migration 009)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'users' AND column_name = 'mobile_number'
    ) THEN
        ALTER TABLE users ADD COLUMN mobile_number VARCHAR(20) UNIQUE;
    END IF;
END $$;

-- Add unique constraint on mobile_number if not exists (for OTP login lookup)
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_mobile_number_unique ON users(mobile_number) WHERE mobile_number IS NOT NULL;

-- ============================================
-- VERIFY
-- ============================================
DO $$ 
BEGIN
    RAISE NOTICE '✅ Migration 023 completed: OTP auth tables and user schema updated';
END $$;
