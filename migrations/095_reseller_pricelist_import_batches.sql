-- Track Excel import batches for B2B pricelist (filename, delete batch)

CREATE TABLE IF NOT EXISTS reseller_pricelist_import_batches (
    id UUID PRIMARY KEY,
    category_id INTEGER NOT NULL REFERENCES reseller_pricelist_categories(id) ON DELETE CASCADE,
    owner_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    source_filename VARCHAR(512) NOT NULL DEFAULT 'Excel import',
    product_count INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_reseller_pricelist_import_batches_cat
    ON reseller_pricelist_import_batches (category_id, owner_user_id, created_at DESC);
