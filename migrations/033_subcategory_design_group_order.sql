-- Per-SKU (web_subcategories) ordering of design_group values for the public catalogue chips.
-- Stored as JSON array of strings; merged at runtime with groups discovered from products.
ALTER TABLE web_subcategories ADD COLUMN IF NOT EXISTS design_group_order JSONB DEFAULT NULL;

COMMENT ON COLUMN web_subcategories.design_group_order IS
    'Optional ordered list of design_group keys (JSON array); order of chips on /catalog for this SKU';
