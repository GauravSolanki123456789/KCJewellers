-- Migration 050: Human-readable weight range for gift items (e.g. "145-155" from Excel AvgWeight)

ALTER TABLE web_products ADD COLUMN IF NOT EXISTS weight_display VARCHAR(64);
ALTER TABLE reseller_product_submissions ADD COLUMN IF NOT EXISTS weight_display VARCHAR(64);

DO $$
BEGIN
    RAISE NOTICE '✅ Migration 050 completed: weight_display';
END $$;
