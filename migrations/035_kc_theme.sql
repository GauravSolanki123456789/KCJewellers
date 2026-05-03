-- KC global + reseller colour themes (kc_theme_id family)
-- Keys: app_settings.kc_theme_id (main app), app_settings.kc_reseller_theme_id (defaults for reseller UX)
-- Column: users.kc_theme_id (per-reseller override when customer_tier = RESELLER)
-- Run: npm run migrate (if your project uses migration runner)

ALTER TABLE users ADD COLUMN IF NOT EXISTS kc_theme_id VARCHAR(64);

INSERT INTO app_settings (key, value, updated_at)
VALUES ('kc_theme_id', 'kci_royal_gold', CURRENT_TIMESTAMP)
ON CONFLICT (key) DO NOTHING;

INSERT INTO app_settings (key, value, updated_at)
VALUES ('kc_reseller_theme_id', 'kci_royal_gold', CURRENT_TIMESTAMP)
ON CONFLICT (key) DO NOTHING;
