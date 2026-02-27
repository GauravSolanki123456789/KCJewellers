-- ============================================
-- Migration 009: Users Extensions & Bookings Table
-- Gaurav Softwares - Jewelry Estimation
-- ============================================
-- Run: npm run migrate
-- ============================================

-- ============================================
-- USERS TABLE: Add mobile_number, is_verified, wallet_balance
-- ============================================
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'users' AND column_name = 'mobile_number'
    ) THEN
        ALTER TABLE users ADD COLUMN mobile_number VARCHAR(20) UNIQUE;
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'users' AND column_name = 'is_verified'
    ) THEN
        ALTER TABLE users ADD COLUMN is_verified BOOLEAN DEFAULT false;
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'users' AND column_name = 'wallet_balance'
    ) THEN
        ALTER TABLE users ADD COLUMN wallet_balance NUMERIC(14,2) DEFAULT 0 NOT NULL;
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_users_mobile_number ON users(mobile_number) WHERE mobile_number IS NOT NULL;

-- ============================================
-- BOOKINGS TABLE
-- ============================================
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'booking_status') THEN
        CREATE TYPE booking_status AS ENUM ('pending_payment', 'booked', 'completed');
    END IF;
END $$;

CREATE TABLE IF NOT EXISTS bookings (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status booking_status NOT NULL DEFAULT 'pending_payment',
    locked_gold_rate NUMERIC(12,2),
    advance_amount NUMERIC(12,2),
    weight_booked NUMERIC(10,3),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_bookings_user_id ON bookings(user_id);
CREATE INDEX IF NOT EXISTS idx_bookings_status ON bookings(status);

-- ============================================
-- VERIFY
-- ============================================
DO $$ 
BEGIN
    RAISE NOTICE '✅ Migration 009 completed: Users columns and bookings table added';
END $$;
