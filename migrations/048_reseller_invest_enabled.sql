-- Migration 048: Enable Invest (SIP) on reseller custom domains when admin toggles on.
-- Keyword: users.reseller_invest_enabled

ALTER TABLE users
    ADD COLUMN IF NOT EXISTS reseller_invest_enabled BOOLEAN NOT NULL DEFAULT false;

DO $$
BEGIN
    RAISE NOTICE '✅ Migration 048 completed: reseller_invest_enabled';
END $$;
