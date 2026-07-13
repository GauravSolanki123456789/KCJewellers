-- Migration 063: Reseller live product edits (weight, MC, photos) without admin re-review
-- users.reseller_product_edits_enabled: admin toggle per RESELLER account

ALTER TABLE users ADD COLUMN IF NOT EXISTS reseller_product_edits_enabled BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN users.reseller_product_edits_enabled IS
    'When true, reseller staff can edit approved (live) product submissions; changes sync to web_products immediately.';

DO $$
BEGIN
    RAISE NOTICE '✅ Migration 063 completed: users.reseller_product_edits_enabled';
END $$;
