-- Template showcase metadata (workflow highlights, system capabilities) per reseller
CREATE TABLE IF NOT EXISTS reseller_enhanced_picture_template_settings (
    id SERIAL PRIMARY KEY,
    reseller_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    template_key VARCHAR(64) NOT NULL,
    workflow_highlights JSONB NOT NULL DEFAULT '[]'::jsonb,
    system_resolutions TEXT,
    system_ratios TEXT,
    sample_label TEXT,
    output_label TEXT,
    output_subtitle TEXT,
    footer_note TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (reseller_user_id, template_key)
);

CREATE INDEX IF NOT EXISTS idx_enhanced_template_settings_user
    ON reseller_enhanced_picture_template_settings (reseller_user_id, template_key);
