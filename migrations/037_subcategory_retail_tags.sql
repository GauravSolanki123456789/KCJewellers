-- Migration 037: Retail presentation tags on web_subcategories (audience + product_type)
-- ERP sync unchanged — tags are admin-managed on SKU (subcategory) rows only.

ALTER TABLE web_subcategories
    ADD COLUMN IF NOT EXISTS audience VARCHAR(20) DEFAULT NULL;

ALTER TABLE web_subcategories
    ADD COLUMN IF NOT EXISTS product_type VARCHAR(40) DEFAULT NULL;

COMMENT ON COLUMN web_subcategories.audience IS 'Storefront shop-for filter: women, men, kids, unisex (NULL = all audiences)';
COMMENT ON COLUMN web_subcategories.product_type IS 'Canonical product type for browse/search grouping: necklace, bangle, ring, etc.';

CREATE INDEX IF NOT EXISTS idx_web_subcategories_audience ON web_subcategories(audience);
CREATE INDEX IF NOT EXISTS idx_web_subcategories_product_type ON web_subcategories(product_type);
