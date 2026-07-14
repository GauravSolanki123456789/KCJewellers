-- Customer identity on shared catalogue inquiries + admin SMS OTP settings

ALTER TABLE shared_catalog_inquiries
    ADD COLUMN IF NOT EXISTS customer_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS customer_mobile VARCHAR(10),
    ADD COLUMN IF NOT EXISTS customer_name VARCHAR(255);

CREATE INDEX IF NOT EXISTS idx_shared_catalog_inquiries_customer_mobile
    ON shared_catalog_inquiries (customer_mobile);

CREATE INDEX IF NOT EXISTS idx_shared_catalog_inquiries_customer_user
    ON shared_catalog_inquiries (customer_user_id);

INSERT INTO app_settings (key, value, updated_at) VALUES
    ('sms_provider', '', CURRENT_TIMESTAMP),
    ('fast2sms_api_key', '', CURRENT_TIMESTAMP),
    ('msg91_auth_key', '', CURRENT_TIMESTAMP),
    ('msg91_sender_id', 'KCJEWL', CURRENT_TIMESTAMP),
    ('twilio_account_sid', '', CURRENT_TIMESTAMP),
    ('twilio_auth_token', '', CURRENT_TIMESTAMP),
    ('twilio_phone_number', '', CURRENT_TIMESTAMP)
ON CONFLICT (key) DO NOTHING;
