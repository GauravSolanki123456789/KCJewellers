-- Migration 080: With-box-only products + MRP behind box + reseller storefront toggle

ALTER TABLE web_products
    ADD COLUMN IF NOT EXISTS with_box_charges_only BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS mrp_rate_behind_box NUMERIC(12, 2);

ALTER TABLE reseller_product_submissions
    ADD COLUMN IF NOT EXISTS with_box_charges_only BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS mrp_rate_behind_box NUMERIC(12, 2);

ALTER TABLE users
    ADD COLUMN IF NOT EXISTS reseller_show_mrp_behind_box BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN web_products.with_box_charges_only IS
    'When true, product is sold with box only — box_charges from Excel WithBoxChargesOnly column.';

COMMENT ON COLUMN web_products.mrp_rate_behind_box IS
    'Optional MRP printed on box (informational) — from Excel MRP RATE(BEHIND BOX).';

COMMENT ON COLUMN users.reseller_show_mrp_behind_box IS
    'Reseller staff toggle: show mrp_rate_behind_box on storefront product cards for customers.';

DO $$
BEGIN
    RAISE NOTICE '✅ Migration 080 completed: with_box_charges_only, mrp_rate_behind_box, reseller_show_mrp_behind_box';
END $$;
