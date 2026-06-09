-- Migration 050: Excel AvgWeight range text on reseller submissions
ALTER TABLE reseller_product_submissions ADD COLUMN IF NOT EXISTS weight_display VARCHAR(64);

DO $$
BEGIN
    RAISE NOTICE '✅ Migration 050 completed: reseller_product_submissions.weight_display';
END $$;
