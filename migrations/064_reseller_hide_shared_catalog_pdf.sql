-- Migration 064: Hide PDF shortlist on shared catalogues for selected resellers
-- users.reseller_hide_shared_catalog_pdf: admin toggle per RESELLER account
-- shared_catalogs.hide_pdf: snapshot at link creation (consistent for the brochure lifetime)

ALTER TABLE users ADD COLUMN IF NOT EXISTS reseller_hide_shared_catalog_pdf BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE shared_catalogs ADD COLUMN IF NOT EXISTS hide_pdf BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN users.reseller_hide_shared_catalog_pdf IS
    'When true, customers on this reseller shared catalogue links can use WhatsApp (text) only — no PDF with photos.';

COMMENT ON COLUMN shared_catalogs.hide_pdf IS
    'Snapshot from users.reseller_hide_shared_catalog_pdf when the shared link was created.';

DO $$
BEGIN
    RAISE NOTICE '✅ Migration 064 completed: reseller_hide_shared_catalog_pdf + shared_catalogs.hide_pdf';
END $$;
