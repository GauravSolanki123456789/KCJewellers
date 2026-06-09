-- Migration 049: Gift box charges + extra product media (box photo, video)
-- web_products + reseller_product_submissions

ALTER TABLE web_products ADD COLUMN IF NOT EXISTS box_charges NUMERIC(12, 2) DEFAULT 0;
ALTER TABLE web_products ADD COLUMN IF NOT EXISTS box_image_url TEXT;
ALTER TABLE web_products ADD COLUMN IF NOT EXISTS video_url TEXT;

ALTER TABLE reseller_product_submissions ADD COLUMN IF NOT EXISTS box_image_url TEXT;
ALTER TABLE reseller_product_submissions ADD COLUMN IF NOT EXISTS video_url TEXT;

DO $$
BEGIN
    RAISE NOTICE '✅ Migration 049 completed: box_charges, box_image_url, video_url';
END $$;
