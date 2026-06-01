-- Admin toggle: add GST on gift-item fixed prices (default on — matches existing behaviour).
INSERT INTO app_settings (key, value, updated_at)
VALUES ('gifting_gst_enabled', 'true', CURRENT_TIMESTAMP)
ON CONFLICT (key) DO NOTHING;
