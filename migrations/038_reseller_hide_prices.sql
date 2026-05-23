-- Migration 038: Reseller weight-only shared catalogues (hide prices on shared links/PDF)
-- users.reseller_hide_prices: admin toggle per RESELLER account
-- shared_catalogs.hide_prices: snapshot at link creation (consistent for the brochure lifetime)

ALTER TABLE users ADD COLUMN IF NOT EXISTS reseller_hide_prices BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE shared_catalogs ADD COLUMN IF NOT EXISTS hide_prices BOOLEAN NOT NULL DEFAULT false;

DO $$
BEGIN
    RAISE NOTICE '✅ Migration 038 completed: reseller_hide_prices + shared_catalogs.hide_prices';
END $$;
