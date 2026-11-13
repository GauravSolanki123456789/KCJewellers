-- Per-family Kumudu field mappings + ERP intelligent style rules (Pitara, Air, shortcode families).

ALTER TABLE reseller_kumudu_link
    ADD COLUMN IF NOT EXISTS family_mappings JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE reseller_kumudu_link
    ADD COLUMN IF NOT EXISTS erp_config JSONB NOT NULL DEFAULT '{}'::jsonb;
