-- Design master (style → SKU defaults) + per-upload history inside stock batches

CREATE TABLE IF NOT EXISTS reseller_erp_design_styles (
    id SERIAL PRIMARY KEY,
    reseller_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    style_code VARCHAR(128) NOT NULL,
    style_name VARCHAR(255),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (reseller_user_id, style_code)
);
CREATE INDEX IF NOT EXISTS idx_reseller_erp_design_styles_owner
    ON reseller_erp_design_styles (reseller_user_id, style_code);

CREATE TABLE IF NOT EXISTS reseller_erp_design_skus (
    id SERIAL PRIMARY KEY,
    reseller_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    style_id INTEGER NOT NULL REFERENCES reseller_erp_design_styles(id) ON DELETE CASCADE,
    sku VARCHAR(128) NOT NULL,
    product_name VARCHAR(255),
    purity NUMERIC(8, 2),
    metal_type VARCHAR(64),
    wastage_pct NUMERIC(8, 2),
    mc_rate NUMERIC(12, 2),
    mc_rate_slab_r NUMERIC(12, 2),
    mc_rate_slab_w NUMERIC(12, 2),
    mc_rate_slab_f NUMERIC(12, 2),
    metal_slab_r_pct NUMERIC(8, 4),
    metal_slab_w_pct NUMERIC(8, 4),
    metal_slab_f_pct NUMERIC(8, 4),
    mc_type VARCHAR(32),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (reseller_user_id, style_id, sku)
);
CREATE INDEX IF NOT EXISTS idx_reseller_erp_design_skus_style
    ON reseller_erp_design_skus (style_id, sku);

CREATE TABLE IF NOT EXISTS reseller_erp_stock_import_batches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    stock_batch_id UUID NOT NULL REFERENCES reseller_erp_stock_batches(id) ON DELETE CASCADE,
    reseller_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    source_filename VARCHAR(512) NOT NULL DEFAULT 'Excel import',
    piece_count INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_reseller_erp_stock_import_batches_batch
    ON reseller_erp_stock_import_batches (stock_batch_id, created_at DESC);

ALTER TABLE reseller_erp_stock_pieces
    ADD COLUMN IF NOT EXISTS import_batch_id UUID REFERENCES reseller_erp_stock_import_batches(id) ON DELETE SET NULL;
