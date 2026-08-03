-- Per-reseller AI provider / model / API keys for Enhanced Pictures Prompt Lab
ALTER TABLE users
    ADD COLUMN IF NOT EXISTS reseller_enhanced_ai_provider VARCHAR(32) NOT NULL DEFAULT 'gemini';

ALTER TABLE users
    ADD COLUMN IF NOT EXISTS reseller_enhanced_gemini_api_key TEXT;

ALTER TABLE users
    ADD COLUMN IF NOT EXISTS reseller_enhanced_gemini_model VARCHAR(128);

ALTER TABLE users
    ADD COLUMN IF NOT EXISTS reseller_enhanced_replicate_api_token TEXT;

ALTER TABLE users
    ADD COLUMN IF NOT EXISTS reseller_enhanced_replicate_model VARCHAR(255);

ALTER TABLE reseller_enhanced_picture_jobs
    ADD COLUMN IF NOT EXISTS ai_provider VARCHAR(32);

ALTER TABLE reseller_enhanced_picture_jobs
    ADD COLUMN IF NOT EXISTS ai_model VARCHAR(255);
