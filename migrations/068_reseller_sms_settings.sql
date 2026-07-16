-- Per-reseller SMS / OTP for shared catalogue links (independent of admin global settings).
ALTER TABLE users ADD COLUMN IF NOT EXISTS reseller_shared_catalog_otp_enabled BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS reseller_sms_provider VARCHAR(32) DEFAULT '';
ALTER TABLE users ADD COLUMN IF NOT EXISTS reseller_o3sms_api_key TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS reseller_o3sms_sender_id VARCHAR(16);
ALTER TABLE users ADD COLUMN IF NOT EXISTS reseller_o3sms_route VARCHAR(8) DEFAULT '2';
ALTER TABLE users ADD COLUMN IF NOT EXISTS reseller_o3sms_dlt_template_id VARCHAR(64);
ALTER TABLE users ADD COLUMN IF NOT EXISTS reseller_o3sms_message_template TEXT;
