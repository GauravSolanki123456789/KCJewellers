-- Customer messages from reseller vanity storefront contact forms.

CREATE TABLE IF NOT EXISTS reseller_storefront_contact_messages (
    id SERIAL PRIMARY KEY,
    reseller_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    sender_name VARCHAR(120) NOT NULL,
    sender_mobile VARCHAR(10) NOT NULL,
    sender_email VARCHAR(120),
    message TEXT NOT NULL,
    source_domain VARCHAR(255),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    read_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_storefront_contact_reseller_created
    ON reseller_storefront_contact_messages (reseller_user_id, created_at DESC);

DO $$ BEGIN
    RAISE NOTICE '✅ Migration 131: storefront contact messages';
END $$;
