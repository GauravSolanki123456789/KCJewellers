-- Admin opt-in: custom homepage + Profile → Your website (default off).

ALTER TABLE users
    ADD COLUMN IF NOT EXISTS reseller_storefront_website_enabled BOOLEAN NOT NULL DEFAULT false;

DO $$ BEGIN
    RAISE NOTICE '✅ Migration 115: reseller_storefront_website_enabled';
END $$;
