-- Custom template labels per reseller (Prompt Lab templates beyond built-in idols)
ALTER TABLE reseller_enhanced_picture_template_settings
    ADD COLUMN IF NOT EXISTS template_label VARCHAR(120),
    ADD COLUMN IF NOT EXISTS template_description TEXT;

COMMENT ON COLUMN reseller_enhanced_picture_template_settings.template_label IS
    'Display name in Prompt Lab / reseller studio template picker.';
COMMENT ON COLUMN reseller_enhanced_picture_template_settings.template_description IS
    'Short helper shown under template name for reseller staff.';

DO $$
BEGIN
    RAISE NOTICE '✅ Migration 083 completed: template_label, template_description';
END $$;
