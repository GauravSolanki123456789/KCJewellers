-- ============================================
-- Migration 024: SIP Plans metal_type safeguard
-- Ensures sip_plans has Fintech columns (metal_type, etc.)
-- Run if 022 partially failed or production DB is missing these columns
-- ============================================

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'sip_plans' AND column_name = 'metal_type') THEN
        ALTER TABLE sip_plans ADD COLUMN metal_type VARCHAR(20);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'sip_plans' AND column_name = 'installment_amount') THEN
        ALTER TABLE sip_plans ADD COLUMN installment_amount NUMERIC(12,2);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'sip_plans' AND column_name = 'jeweler_benefit_percentage') THEN
        ALTER TABLE sip_plans ADD COLUMN jeweler_benefit_percentage NUMERIC(5,2);
    END IF;
END $$;

DO $$
BEGIN
    RAISE NOTICE '✅ Migration 024 completed: sip_plans Fintech columns safeguard';
END $$;
