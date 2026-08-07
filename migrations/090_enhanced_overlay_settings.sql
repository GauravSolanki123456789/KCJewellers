-- Reseller watermark / info-text overlay preferences for Enhanced Pictures
ALTER TABLE users
    ADD COLUMN IF NOT EXISTS reseller_enhanced_overlay_settings JSONB NOT NULL DEFAULT '{}'::jsonb;
