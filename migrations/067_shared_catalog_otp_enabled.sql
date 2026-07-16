-- Admin toggle: require OTP on shared catalogue sign-in (false = mobile number only).
INSERT INTO app_settings (key, value, updated_at)
VALUES ('shared_catalog_otp_enabled', 'true', CURRENT_TIMESTAMP)
ON CONFLICT (key) DO NOTHING;
