-- Size / product-name ROL targets (grams), independent of weight-range ROL.
-- Used for plated / chain / gift items (e.g. Subhyog reorder Excel).

CREATE TABLE IF NOT EXISTS reseller_erp_rol_size_targets (
    id SERIAL PRIMARY KEY,
    reseller_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    style_code VARCHAR(128) NOT NULL,
    sku VARCHAR(128) NOT NULL,
    product_name VARCHAR(255) NOT NULL DEFAULT '',
    size VARCHAR(64) NOT NULL DEFAULT '',
    rol_wt_g NUMERIC(14, 3) NOT NULL DEFAULT 0,
    rol_qty INTEGER NOT NULL DEFAULT 0,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (reseller_user_id, style_code, sku, product_name, size)
);

CREATE INDEX IF NOT EXISTS idx_reseller_erp_rol_size_targets_lookup
    ON reseller_erp_rol_size_targets (reseller_user_id, style_code, sku);
