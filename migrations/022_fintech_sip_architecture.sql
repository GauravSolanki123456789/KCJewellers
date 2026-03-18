-- ============================================
-- Migration 022: Fintech SIP Architecture
-- Gaurav Softwares - KC Jewellers
-- ============================================
-- Run: npm run migrate
-- ============================================
-- Systematic Investment Plan (SIP) for Gold, Silver, Diamond
-- Admin creates plans; customers subscribe with Autopay; cancellation triggers payout requests
-- ============================================

-- ============================================
-- 1. sip_plans: Add Fintech columns
-- ============================================
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'sip_plans' AND column_name = 'metal_type') THEN
        ALTER TABLE sip_plans ADD COLUMN metal_type VARCHAR(20) CHECK (metal_type IN ('gold', 'silver', 'diamond'));
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'sip_plans' AND column_name = 'installment_amount') THEN
        ALTER TABLE sip_plans ADD COLUMN installment_amount NUMERIC(12,2);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'sip_plans' AND column_name = 'jeweler_benefit_percentage') THEN
        ALTER TABLE sip_plans ADD COLUMN jeweler_benefit_percentage NUMERIC(5,2);
    END IF;
END $$;

-- ============================================
-- 2. user_sips: Customer SIP subscriptions
-- ============================================
CREATE TABLE IF NOT EXISTS user_sips (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    plan_id INTEGER NOT NULL REFERENCES sip_plans(id) ON DELETE RESTRICT,
    start_date TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    maturity_date TIMESTAMP,
    autopay_mandate_id VARCHAR(255),
    status VARCHAR(50) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'cancellation_requested', 'cancelled_and_refunded')),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_user_sips_user ON user_sips(user_id);
CREATE INDEX IF NOT EXISTS idx_user_sips_plan ON user_sips(plan_id);
CREATE INDEX IF NOT EXISTS idx_user_sips_status ON user_sips(status);
CREATE INDEX IF NOT EXISTS idx_user_sips_autopay ON user_sips(autopay_mandate_id) WHERE autopay_mandate_id IS NOT NULL;

-- ============================================
-- 3. sip_transactions: Add Fintech columns
-- ============================================
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'sip_transactions' AND column_name = 'user_sip_id') THEN
        ALTER TABLE sip_transactions ADD COLUMN user_sip_id INTEGER REFERENCES user_sips(id) ON DELETE SET NULL;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'sip_transactions' AND column_name = 'amount_paid') THEN
        ALTER TABLE sip_transactions ADD COLUMN amount_paid NUMERIC(12,2);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'sip_transactions' AND column_name = 'payment_date') THEN
        ALTER TABLE sip_transactions ADD COLUMN payment_date TIMESTAMP;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'sip_transactions' AND column_name = 'metal_rate_on_date') THEN
        ALTER TABLE sip_transactions ADD COLUMN metal_rate_on_date NUMERIC(12,2);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'sip_transactions' AND column_name = 'accumulated_grams') THEN
        ALTER TABLE sip_transactions ADD COLUMN accumulated_grams NUMERIC(12,6);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'sip_transactions' AND column_name = 'type') THEN
        ALTER TABLE sip_transactions ADD COLUMN type VARCHAR(20) CHECK (type IN ('installment', 'benefit', 'refund'));
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_sip_tx_user_sip ON sip_transactions(user_sip_id) WHERE user_sip_id IS NOT NULL;

-- ============================================
-- 4. sip_payout_requests: Add Fintech columns
-- ============================================
-- Allow grams to be NULL for SIP cancellation payouts (amount-based)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'sip_payout_requests' AND column_name = 'grams') THEN
        ALTER TABLE sip_payout_requests ALTER COLUMN grams DROP NOT NULL;
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'sip_payout_requests' AND column_name = 'user_sip_id') THEN
        ALTER TABLE sip_payout_requests ADD COLUMN user_sip_id INTEGER REFERENCES user_sips(id) ON DELETE SET NULL;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'sip_payout_requests' AND column_name = 'requested_amount') THEN
        ALTER TABLE sip_payout_requests ADD COLUMN requested_amount NUMERIC(12,2);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'sip_payout_requests' AND column_name = 'request_date') THEN
        ALTER TABLE sip_payout_requests ADD COLUMN request_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'sip_payout_requests' AND column_name = 'admin_remarks') THEN
        ALTER TABLE sip_payout_requests ADD COLUMN admin_remarks TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'sip_payout_requests' AND column_name = 'paid_on_date') THEN
        ALTER TABLE sip_payout_requests ADD COLUMN paid_on_date TIMESTAMP;
    END IF;
END $$;

-- Backfill request_date from created_at for existing rows
UPDATE sip_payout_requests SET request_date = created_at WHERE request_date IS NULL;

-- Allow status values: pending, paid, rejected (for Fintech SIP) + legacy PENDING_ADMIN_APPROVAL, APPROVED
-- Existing CHECK may restrict; we add a comment. If there's a CHECK, we may need to alter it.
-- PostgreSQL: If sip_payout_requests was created without CHECK on status, we're fine.
-- For new SIP payouts we use 'pending','paid','rejected'

CREATE INDEX IF NOT EXISTS idx_sip_payout_user_sip ON sip_payout_requests(user_sip_id) WHERE user_sip_id IS NOT NULL;

-- ============================================
-- Notices
-- ============================================
DO $$
BEGIN
    RAISE NOTICE '✅ Migration 022 completed: Fintech SIP architecture (sip_plans, user_sips, sip_transactions, sip_payout_requests)';
END $$;
