-- ============================================
-- Migration 037: Retail tags (Shop for / product type)
-- Audience + product_type on web_subcategories; admin toggle in app_settings.
-- ERP sync (style code / SKU) unchanged.
-- ============================================

ALTER TABLE web_subcategories
  ADD COLUMN IF NOT EXISTS audience VARCHAR(20) DEFAULT NULL;

ALTER TABLE web_subcategories
  ADD COLUMN IF NOT EXISTS product_type VARCHAR(40) DEFAULT NULL;

INSERT INTO app_settings (key, value, updated_at)
VALUES ('catalog_retail_browse_enabled', 'false', CURRENT_TIMESTAMP)
ON CONFLICT (key) DO NOTHING;
