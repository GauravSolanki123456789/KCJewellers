-- Wastage % and optional component weights (chain / pendant / earring) for catalogue display.
ALTER TABLE web_products ADD COLUMN IF NOT EXISTS wastage_pct NUMERIC(5, 2);
ALTER TABLE web_products ADD COLUMN IF NOT EXISTS chain_weight NUMERIC(10, 3);
ALTER TABLE web_products ADD COLUMN IF NOT EXISTS pendant_weight NUMERIC(10, 3);
ALTER TABLE web_products ADD COLUMN IF NOT EXISTS earring_weight NUMERIC(10, 3);

ALTER TABLE reseller_product_submissions ADD COLUMN IF NOT EXISTS wastage_pct NUMERIC(5, 2);
ALTER TABLE reseller_product_submissions ADD COLUMN IF NOT EXISTS chain_weight NUMERIC(10, 3);
ALTER TABLE reseller_product_submissions ADD COLUMN IF NOT EXISTS pendant_weight NUMERIC(10, 3);
ALTER TABLE reseller_product_submissions ADD COLUMN IF NOT EXISTS earring_weight NUMERIC(10, 3);

-- Backfill wastage from stored gross/net where possible.
UPDATE web_products
SET wastage_pct = ROUND(((gross_weight / NULLIF(net_weight, 0)) - 1) * 100, 2)
WHERE wastage_pct IS NULL
  AND gross_weight IS NOT NULL
  AND net_weight IS NOT NULL
  AND net_weight > 0
  AND gross_weight > net_weight
  AND COALESCE(metal_type, '') NOT ILIKE 'gifting%';

DO $$
BEGIN
    RAISE NOTICE '✅ Migration 055 completed: wastage_pct + component weights on web_products / reseller submissions';
END $$;
