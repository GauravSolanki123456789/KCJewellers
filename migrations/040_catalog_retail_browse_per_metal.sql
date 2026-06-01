-- Per-metal Shop for toggles (Gold / Silver / Diamond). Gift Items never use Shop for.
-- Seeds from legacy catalog_retail_browse_enabled when per-metal keys are absent.

INSERT INTO app_settings (key, value, updated_at)
SELECT 'catalog_retail_browse_gold', value, CURRENT_TIMESTAMP
FROM app_settings WHERE key = 'catalog_retail_browse_enabled'
ON CONFLICT (key) DO NOTHING;

INSERT INTO app_settings (key, value, updated_at)
SELECT 'catalog_retail_browse_silver', value, CURRENT_TIMESTAMP
FROM app_settings WHERE key = 'catalog_retail_browse_enabled'
ON CONFLICT (key) DO NOTHING;

INSERT INTO app_settings (key, value, updated_at)
SELECT 'catalog_retail_browse_diamond', value, CURRENT_TIMESTAMP
FROM app_settings WHERE key = 'catalog_retail_browse_enabled'
ON CONFLICT (key) DO NOTHING;
