-- Migration 089: Template visibility for resellers + 4-step studio pipeline flag

ALTER TABLE reseller_enhanced_picture_template_settings
    ADD COLUMN IF NOT EXISTS is_enabled BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE users
    ADD COLUMN IF NOT EXISTS reseller_enhanced_studio_pipeline_enabled BOOLEAN NOT NULL DEFAULT true;

COMMENT ON COLUMN reseller_enhanced_picture_template_settings.is_enabled IS
    'When false, this template (and its sub-templates) are hidden from the reseller studio.';

COMMENT ON COLUMN users.reseller_enhanced_studio_pipeline_enabled IS
    'When true, generation uses 4-step pipeline: cutout → spatial lock → composite/relight → upscale.';

DO $$
BEGIN
    RAISE NOTICE '✅ Migration 089 completed: Prompt Lab template access + studio pipeline flag';
END $$;
