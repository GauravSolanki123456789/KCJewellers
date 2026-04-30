-- Reseller white-label: RESELLER tier + optional branding/catalog-scope columns on users
-- Safe additive migration — existing rows keep their customer_tier values; only the allowed values widen.

ALTER TABLE users DROP CONSTRAINT IF EXISTS users_customer_tier_check;

ALTER TABLE users ADD CONSTRAINT users_customer_tier_check
    CHECK (customer_tier IN ('ADMIN', 'B2C_CUSTOMER', 'B2B_WHOLESALE', 'RESELLER'));

ALTER TABLE users ADD COLUMN IF NOT EXISTS business_name VARCHAR(255);
ALTER TABLE users ADD COLUMN IF NOT EXISTS custom_domain VARCHAR(255);
ALTER TABLE users ADD COLUMN IF NOT EXISTS logo_url TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS allowed_category_ids INTEGER[];

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_custom_domain_lower
    ON users (LOWER(TRIM(custom_domain)))
    WHERE custom_domain IS NOT NULL AND TRIM(custom_domain) <> '';
