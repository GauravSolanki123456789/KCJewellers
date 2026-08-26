-- Track last wholesale rate update on shared catalogue links.

ALTER TABLE shared_catalogs
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP;
