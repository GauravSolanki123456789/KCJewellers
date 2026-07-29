-- Reseller-uploaded MC slab tables (Excel) + snapshot on shared catalog links.

ALTER TABLE users
    ADD COLUMN IF NOT EXISTS reseller_upload_slabs_enabled BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE users
    ADD COLUMN IF NOT EXISTS reseller_mc_slab_rows JSONB NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE users
    ADD COLUMN IF NOT EXISTS reseller_mc_slab_uploaded_at TIMESTAMPTZ;

ALTER TABLE shared_catalogs
    ADD COLUMN IF NOT EXISTS uploaded_mc_slab_key VARCHAR(64);

ALTER TABLE shared_catalogs
    ADD COLUMN IF NOT EXISTS uploaded_mc_slab_rows_snapshot JSONB;
