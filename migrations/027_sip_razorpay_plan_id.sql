-- ============================================
-- Migration 027: SIP Razorpay Plan ID
-- Gaurav Softwares - KC Jewellers
-- ============================================
-- Run: npm run migrate
-- ============================================
-- Add razorpay_plan_id to sip_plans for Razorpay Subscriptions (Autopay)
-- ============================================

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'sip_plans' AND column_name = 'razorpay_plan_id'
    ) THEN
        ALTER TABLE sip_plans ADD COLUMN razorpay_plan_id VARCHAR(100);
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_sip_plans_razorpay_plan_id ON sip_plans(razorpay_plan_id) WHERE razorpay_plan_id IS NOT NULL;

DO $$
BEGIN
    RAISE NOTICE '✅ Migration 027 completed: sip_plans.razorpay_plan_id added';
END $$;
