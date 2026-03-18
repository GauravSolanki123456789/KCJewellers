-- ============================================
-- Migration 023: SIP Redemption at Checkout
-- Gaurav Softwares - KC Jewellers
-- ============================================
-- Run: npm run migrate
-- ============================================
-- Enables customers to redeem completed SIPs at checkout
-- ============================================

-- ============================================
-- 1. user_sips: Add 'redeemed' status
-- ============================================
DO $$
DECLARE
    cn TEXT;
BEGIN
    SELECT conname INTO cn FROM pg_constraint
    WHERE conrelid = 'user_sips'::regclass AND contype = 'c'
    AND pg_get_constraintdef(oid) LIKE '%status%';
    IF cn IS NOT NULL THEN
        EXECUTE format('ALTER TABLE user_sips DROP CONSTRAINT %I', cn);
    END IF;
    ALTER TABLE user_sips ADD CONSTRAINT user_sips_status_check
        CHECK (status IN ('active', 'completed', 'cancellation_requested', 'cancelled_and_refunded', 'redeemed'));
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'user_sips status constraint: %', SQLERRM;
END $$;

-- ============================================
-- 2. orders: Add SIP redemption columns
-- ============================================
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'orders' AND column_name = 'sip_redemption_amount') THEN
        ALTER TABLE orders ADD COLUMN sip_redemption_amount NUMERIC(12,2) DEFAULT 0;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'orders' AND column_name = 'sip_user_sip_id') THEN
        ALTER TABLE orders ADD COLUMN sip_user_sip_id INTEGER REFERENCES user_sips(id) ON DELETE SET NULL;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'orders' AND column_name = 'amount_paid_via_pg') THEN
        ALTER TABLE orders ADD COLUMN amount_paid_via_pg NUMERIC(12,2);
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_orders_sip_user_sip ON orders(sip_user_sip_id) WHERE sip_user_sip_id IS NOT NULL;

DO $$
BEGIN
    RAISE NOTICE '✅ Migration 023 completed: SIP redemption at checkout (orders, user_sips)';
END $$;
