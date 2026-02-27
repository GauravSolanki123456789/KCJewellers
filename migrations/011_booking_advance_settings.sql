-- ============================================
-- Migration 011: Booking Advance Settings & Bookings Columns
-- Gaurav Softwares - Jewelry Estimation
-- ============================================
-- Run: npm run migrate
-- ============================================

-- ============================================
-- APP_SETTINGS: Key-value for admin-configurable settings
-- ============================================
CREATE TABLE IF NOT EXISTS app_settings (
    id SERIAL PRIMARY KEY,
    key VARCHAR(100) UNIQUE NOT NULL,
    value TEXT,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_app_settings_key ON app_settings(key);

-- Default booking advance amount (₹5000)
INSERT INTO app_settings (key, value, updated_at)
VALUES ('booking_advance_amount', '5000', CURRENT_TIMESTAMP)
ON CONFLICT (key) DO NOTHING;

-- ============================================
-- BOOKINGS: Add metal_type and mobile_number if not exists
-- ============================================
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'bookings' AND column_name = 'metal_type'
    ) THEN
        ALTER TABLE bookings ADD COLUMN metal_type VARCHAR(50);
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'bookings' AND column_name = 'mobile_number'
    ) THEN
        ALTER TABLE bookings ADD COLUMN mobile_number VARCHAR(20);
    END IF;
END $$;

-- Allow user_id NULL for guest rate bookings (identified by mobile_number)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'bookings' AND column_name = 'user_id') THEN
        ALTER TABLE bookings ALTER COLUMN user_id DROP NOT NULL;
    END IF;
END $$;
