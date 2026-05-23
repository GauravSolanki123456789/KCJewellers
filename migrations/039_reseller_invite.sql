-- ============================================
-- Migration 039: Reseller invite codes & applications queue
-- Gaurav Softwares - KC Jewellers
-- ============================================
-- Run: npm run migrate
-- ============================================
-- Each RESELLER gets a unique `reseller_invite_code` (admin-assigned).
-- Prospects apply via /join-reseller; rows land in `reseller_applications`.
-- ============================================

ALTER TABLE users ADD COLUMN IF NOT EXISTS reseller_invite_code VARCHAR(50);
ALTER TABLE users ADD COLUMN IF NOT EXISTS referred_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_reseller_invite_code_lower
    ON users (LOWER(TRIM(reseller_invite_code)))
    WHERE reseller_invite_code IS NOT NULL AND TRIM(reseller_invite_code) <> '';

CREATE INDEX IF NOT EXISTS idx_users_referred_by_user_id
    ON users (referred_by_user_id)
    WHERE referred_by_user_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS reseller_applications (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    reseller_invite_code VARCHAR(50) NOT NULL,
    referred_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    contact_name VARCHAR(255) NOT NULL,
    business_name VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL,
    mobile_number VARCHAR(20) NOT NULL,
    city_state VARCHAR(255),
    desired_custom_domain VARCHAR(255),
    notes TEXT,
    application_status VARCHAR(32) NOT NULL DEFAULT 'pending'
        CHECK (application_status IN ('pending', 'approved', 'rejected')),
    reviewed_at TIMESTAMPTZ,
    reviewed_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_reseller_applications_status
    ON reseller_applications (application_status);

CREATE INDEX IF NOT EXISTS idx_reseller_applications_referred_by
    ON reseller_applications (referred_by_user_id)
    WHERE referred_by_user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_reseller_applications_user_created
    ON reseller_applications (user_id, created_at DESC);

DO $$
BEGIN
    RAISE NOTICE '✅ Migration 039 completed: reseller_invite_code, referred_by_user_id, reseller_applications';
END $$;
