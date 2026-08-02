-- Migration 078: Enhanced Picture subscription (AI studio photos for resellers)

ALTER TABLE users
    ADD COLUMN IF NOT EXISTS reseller_enhanced_pictures_enabled BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN users.reseller_enhanced_pictures_enabled IS
    'Admin toggle: reseller staff can use /reseller/enhanced-pictures AI studio templates.';

CREATE TABLE IF NOT EXISTS reseller_enhanced_picture_prompts (
    id SERIAL PRIMARY KEY,
    reseller_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    template_key VARCHAR(64) NOT NULL DEFAULT 'idols',
    name VARCHAR(200) NOT NULL,
    prompt_text TEXT NOT NULL,
    negative_prompt TEXT,
    is_active BOOLEAN NOT NULL DEFAULT false,
    is_test BOOLEAN NOT NULL DEFAULT true,
    test_source_image_url TEXT,
    test_result_image_url TEXT,
    created_by_admin_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_reseller_enhanced_prompts_user_template
    ON reseller_enhanced_picture_prompts (reseller_user_id, template_key);

CREATE UNIQUE INDEX IF NOT EXISTS idx_reseller_enhanced_prompts_one_active
    ON reseller_enhanced_picture_prompts (reseller_user_id, template_key)
    WHERE is_active = true;

CREATE TABLE IF NOT EXISTS reseller_enhanced_picture_jobs (
    id SERIAL PRIMARY KEY,
    reseller_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    template_key VARCHAR(64) NOT NULL DEFAULT 'idols',
    prompt_id INTEGER REFERENCES reseller_enhanced_picture_prompts(id) ON DELETE SET NULL,
    source_image_url TEXT,
    result_image_url TEXT,
    barcode_stem VARCHAR(255),
    photo_type VARCHAR(20) NOT NULL DEFAULT 'front',
    attached_submission_id INTEGER,
    attached_sku VARCHAR(255),
    status VARCHAR(32) NOT NULL DEFAULT 'pending',
    error_message TEXT,
    created_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_reseller_enhanced_jobs_user
    ON reseller_enhanced_picture_jobs (reseller_user_id, created_at DESC);

DO $$
BEGIN
    RAISE NOTICE '✅ Migration 078 completed: reseller enhanced pictures subscription + prompts + jobs';
END $$;
