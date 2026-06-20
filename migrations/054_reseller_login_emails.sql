-- ============================================
-- Alternate login emails for reseller brands (same users row / brand settings)
-- Run: npm run migrate
-- ============================================

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'reseller_login_emails'
    ) THEN
        CREATE TABLE reseller_login_emails (
            id          BIGSERIAL PRIMARY KEY,
            user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            email       VARCHAR(255) NOT NULL,
            label       VARCHAR(120),
            created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            UNIQUE (email)
        );
        CREATE INDEX idx_reseller_login_emails_user ON reseller_login_emails(user_id);
        CREATE INDEX idx_reseller_login_emails_email_lower ON reseller_login_emails(LOWER(email));
        RAISE NOTICE 'Created reseller_login_emails';
    END IF;
END $$;

DO $$
BEGIN
    RAISE NOTICE '✅ Migration 054 completed: reseller_login_emails';
END $$;
