-- Reseller storefront contact form — status + notes for inbox.

ALTER TABLE reseller_storefront_contact_messages
    ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'open',
    ADD COLUMN IF NOT EXISTS closed_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS reseller_note TEXT;

CREATE INDEX IF NOT EXISTS idx_storefront_contact_reseller_open
    ON reseller_storefront_contact_messages (reseller_user_id, status, created_at DESC);

DO $$ BEGIN
    RAISE NOTICE '✅ Migration 132: storefront contact message status';
END $$;
