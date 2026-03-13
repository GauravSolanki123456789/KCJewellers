-- ============================================
-- Migration 017: Add metal_type to web_products, sort_order to categories/subcategories
-- Gaurav Softwares - Jewelry Estimation
-- ============================================
-- Run: npm run migrate
-- ============================================

-- metal_type on web_products so pricing can pick correct live rate
ALTER TABLE web_products ADD COLUMN IF NOT EXISTS metal_type VARCHAR(50) DEFAULT 'silver';

-- sort_order for manual catalogue reordering (admin)
ALTER TABLE web_categories ADD COLUMN IF NOT EXISTS sort_order INTEGER DEFAULT 0;
ALTER TABLE web_subcategories ADD COLUMN IF NOT EXISTS sort_order INTEGER DEFAULT 0;

-- Seed sort_order from current alphabetical order so nothing changes visually
UPDATE web_categories SET sort_order = sub.rn
FROM (SELECT id, ROW_NUMBER() OVER (ORDER BY name) AS rn FROM web_categories) sub
WHERE web_categories.id = sub.id AND web_categories.sort_order = 0;

UPDATE web_subcategories SET sort_order = sub.rn
FROM (
    SELECT id, ROW_NUMBER() OVER (PARTITION BY category_id ORDER BY name) AS rn
    FROM web_subcategories
) sub
WHERE web_subcategories.id = sub.id AND web_subcategories.sort_order = 0;

CREATE INDEX IF NOT EXISTS idx_web_categories_sort_order ON web_categories(sort_order);
CREATE INDEX IF NOT EXISTS idx_web_subcategories_sort_order ON web_subcategories(sort_order);

DO $$
BEGIN
    RAISE NOTICE '✅ Migration 017 completed: metal_type + sort_order columns added';
END $$;
