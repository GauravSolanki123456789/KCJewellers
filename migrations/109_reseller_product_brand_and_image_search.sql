-- Optional Excel brand column (emerald = make-to-order only) + find product by image toggle

ALTER TABLE reseller_product_submissions
    ADD COLUMN IF NOT EXISTS brand VARCHAR(64),
    ADD COLUMN IF NOT EXISTS make_to_order_only BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE web_products
    ADD COLUMN IF NOT EXISTS brand VARCHAR(64),
    ADD COLUMN IF NOT EXISTS make_to_order_only BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE users
    ADD COLUMN IF NOT EXISTS reseller_image_search_enabled BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_web_products_make_to_order
    ON web_products (subcategory_id, make_to_order_only, updated_at DESC);

DO $$
BEGIN
    RAISE NOTICE '✅ Migration 109: brand, make_to_order_only, reseller_image_search_enabled';
END $$;
