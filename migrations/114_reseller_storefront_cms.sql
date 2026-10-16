-- Reseller vanity storefronts: tenant-scoped customers + homepage CMS.
-- www/apex matching is handled in app code (normalizeStorefrontHostname).

ALTER TABLE users
    ADD COLUMN IF NOT EXISTS storefront_reseller_id INTEGER REFERENCES users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_users_storefront_reseller_id
    ON users (storefront_reseller_id)
    WHERE storefront_reseller_id IS NOT NULL;

-- Same Google/email/mobile may exist on KC and on a reseller storefront.
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_email_key;
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_google_id_key;
DROP INDEX IF EXISTS users_email_key;
DROP INDEX IF EXISTS users_google_id_key;
DROP INDEX IF EXISTS idx_users_email_unique;
DROP INDEX IF EXISTS idx_users_google_id_unique;

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email_per_storefront
    ON users (LOWER(TRIM(email)), COALESCE(storefront_reseller_id, 0))
    WHERE email IS NOT NULL AND TRIM(email) <> '';

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_google_id_per_storefront
    ON users (google_id, COALESCE(storefront_reseller_id, 0))
    WHERE google_id IS NOT NULL AND TRIM(google_id) <> '';

CREATE TABLE IF NOT EXISTS reseller_storefront_sites (
    reseller_user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    draft JSONB NOT NULL DEFAULT '{}'::jsonb,
    published JSONB NOT NULL DEFAULT '{}'::jsonb,
    custom_css TEXT,
    custom_js TEXT,
    custom_head_html TEXT,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    published_at TIMESTAMPTZ
);

DO $$ BEGIN
    RAISE NOTICE '✅ Migration 114: storefront tenant customers + CMS';
END $$;
