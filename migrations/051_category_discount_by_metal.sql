-- Per-metal style discounts (Gold Chain Pendant ≠ Silver Chain Pendant)
ALTER TABLE web_categories
    ADD COLUMN IF NOT EXISTS discount_by_metal JSONB NOT NULL DEFAULT '{}'::jsonb;

DO $$
BEGIN
    RAISE NOTICE '✅ Migration 051: web_categories.discount_by_metal for per-metal style discounts';
END $$;
