-- Persist making-charge type (MC/GM per gram vs MC/PC per piece) on live catalogue rows.

ALTER TABLE web_products ADD COLUMN IF NOT EXISTS mc_type VARCHAR(32);

DO $$
BEGIN
    RAISE NOTICE '✅ Migration 058 completed: web_products.mc_type (MC/GM vs MC/PC)';
END $$;
