-- Snap near-integer wastage_pct (e.g. 5.01 -> 5, 7.99 -> 8) caused by legacy 3dp gross_weight round-off.
-- Matches client snapWastagePercent() / formatWastagePercentLabel() tolerance of 0.05%.

UPDATE web_products
SET wastage_pct = ROUND(wastage_pct)
WHERE wastage_pct IS NOT NULL
  AND wastage_pct > 0
  AND ABS(wastage_pct - ROUND(wastage_pct)) <= 0.05;

UPDATE reseller_product_submissions
SET wastage_pct = ROUND(wastage_pct)
WHERE wastage_pct IS NOT NULL
  AND wastage_pct > 0
  AND ABS(wastage_pct - ROUND(wastage_pct)) <= 0.05;

-- Backfill any rows still missing wastage_pct using snapped whole-number derivation.
UPDATE web_products
SET wastage_pct = ROUND(((gross_weight / NULLIF(net_weight, 0)) - 1) * 100)
WHERE wastage_pct IS NULL
  AND gross_weight IS NOT NULL
  AND net_weight IS NOT NULL
  AND net_weight > 0
  AND gross_weight > net_weight
  AND COALESCE(metal_type, '') NOT ILIKE 'gifting%'
  AND ABS(
    ((gross_weight / NULLIF(net_weight, 0)) - 1) * 100
    - ROUND(((gross_weight / NULLIF(net_weight, 0)) - 1) * 100)
  ) <= 0.05;

UPDATE reseller_product_submissions
SET wastage_pct = ROUND(((gross_weight / NULLIF(net_weight, 0)) - 1) * 100)
WHERE wastage_pct IS NULL
  AND gross_weight IS NOT NULL
  AND net_weight IS NOT NULL
  AND net_weight > 0
  AND gross_weight > net_weight
  AND COALESCE(metal_type, '') NOT ILIKE 'gifting%'
  AND ABS(
    ((gross_weight / NULLIF(net_weight, 0)) - 1) * 100
    - ROUND(((gross_weight / NULLIF(net_weight, 0)) - 1) * 100)
  ) <= 0.05;

DO $$
BEGIN
    RAISE NOTICE '✅ Migration 056 completed: snapped wastage_pct to whole numbers on web_products / reseller submissions';
END $$;
