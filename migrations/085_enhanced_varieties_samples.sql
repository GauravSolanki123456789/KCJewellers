-- Migration 085: Template sample images + product varieties for enhanced pictures

ALTER TABLE reseller_enhanced_picture_template_settings
    ADD COLUMN IF NOT EXISTS sample_source_image_url TEXT,
    ADD COLUMN IF NOT EXISTS sample_result_image_url TEXT;

ALTER TABLE reseller_enhanced_picture_prompts
    ADD COLUMN IF NOT EXISTS variety_key VARCHAR(64);

CREATE TABLE IF NOT EXISTS reseller_enhanced_picture_varieties (
    id SERIAL PRIMARY KEY,
    reseller_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    template_key VARCHAR(64) NOT NULL,
    variety_key VARCHAR(64) NOT NULL,
    variety_label VARCHAR(120) NOT NULL,
    variety_description TEXT,
    sample_source_image_url TEXT,
    sample_result_image_url TEXT,
    is_enabled BOOLEAN NOT NULL DEFAULT true,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (reseller_user_id, template_key, variety_key)
);

CREATE INDEX IF NOT EXISTS idx_enhanced_varieties_user_template
    ON reseller_enhanced_picture_varieties (reseller_user_id, template_key, sort_order);

DROP INDEX IF EXISTS idx_reseller_enhanced_prompts_one_active;

CREATE UNIQUE INDEX IF NOT EXISTS idx_reseller_enhanced_prompts_one_active
    ON reseller_enhanced_picture_prompts (reseller_user_id, template_key, COALESCE(variety_key, ''))
    WHERE is_active = true;

DO $$
BEGIN
    RAISE NOTICE '✅ Migration 085 completed: enhanced picture varieties + sample showcase images';
END $$;
