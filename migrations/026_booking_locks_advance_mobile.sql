-- ============================================
-- Migration 026: booking_locks - advance_amount, mobile_number
-- For Book Rate payment verification flow
-- ============================================
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'booking_locks' AND column_name = 'advance_amount') THEN
        ALTER TABLE booking_locks ADD COLUMN advance_amount NUMERIC(12,2);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'booking_locks' AND column_name = 'mobile_number') THEN
        ALTER TABLE booking_locks ADD COLUMN mobile_number VARCHAR(20);
    END IF;
END $$;
