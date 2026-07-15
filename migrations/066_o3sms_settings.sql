-- Co3SMS / O3SMS OTP provider settings (api.co3.live)

INSERT INTO app_settings (key, value, updated_at) VALUES
    ('o3sms_api_key', '', CURRENT_TIMESTAMP),
    ('o3sms_sender_id', 'ALERTS', CURRENT_TIMESTAMP),
    ('o3sms_route', '2', CURRENT_TIMESTAMP),
    ('o3sms_dlt_template_id', '', CURRENT_TIMESTAMP),
    ('o3sms_message_template', 'Your KC Jewellers verification code is {#var#}. Valid for 10 minutes.', CURRENT_TIMESTAMP)
ON CONFLICT (key) DO NOTHING;
