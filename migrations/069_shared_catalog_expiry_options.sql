-- Admin-configurable shared catalogue link expiry options (hours).
INSERT INTO app_settings (key, value, updated_at)
VALUES (
    'shared_catalog_expiry_options',
    '[{"label":"2 hours","hours":2},{"label":"24 hours","hours":24},{"label":"2 days","hours":48},{"label":"7 days","hours":168},{"label":"24 days","hours":576}]',
    CURRENT_TIMESTAMP
)
ON CONFLICT (key) DO NOTHING;

INSERT INTO app_settings (key, value, updated_at)
VALUES ('shared_catalog_max_expiry_days', '30', CURRENT_TIMESTAMP)
ON CONFLICT (key) DO NOTHING;
