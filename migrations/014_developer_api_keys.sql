-- ============================================
-- Migration 014: Developer API Keys
-- Gaurav Softwares - Jewelry Estimation
-- ============================================
-- Adds a dedicated api_key column to app_settings so a single
-- row (key = 'developer_api_key') stores the secret used by
-- external ERPs to authenticate against POST /api/sync/receive.
-- ============================================

ALTER TABLE app_settings
    ADD COLUMN IF NOT EXISTS api_key VARCHAR(255) DEFAULT NULL;

-- Seed an empty placeholder row so GET returns a predictable result
-- before the admin has generated a key for the first time.
INSERT INTO app_settings (key, value, updated_at)
VALUES ('developer_api_key', 'managed', CURRENT_TIMESTAMP)
ON CONFLICT (key) DO NOTHING;
