-- Individual barcoded stock pieces for reseller ERP (separate from catalogue Excel batches).

CREATE TABLE IF NOT EXISTS reseller_erp_stock_batches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    reseller_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    batch_label VARCHAR(255) NOT NULL,
    row_count INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_reseller_erp_stock_batches_reseller
    ON reseller_erp_stock_batches (reseller_user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS reseller_erp_stock_pieces (
    id SERIAL PRIMARY KEY,
    reseller_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    batch_id UUID REFERENCES reseller_erp_stock_batches(id) ON DELETE SET NULL,
    barcode VARCHAR(128) NOT NULL,
    sku VARCHAR(128),
    style_code VARCHAR(128),
    product_name VARCHAR(255),
    size VARCHAR(64),
    avg_weight NUMERIC(12, 3),
    purity NUMERIC(8, 2),
    wastage_pct NUMERIC(8, 2),
    mc_rate NUMERIC(12, 2),
    mc_type VARCHAR(32),
    pcs INTEGER NOT NULL DEFAULT 1,
    box_charges NUMERIC(12, 2) DEFAULT 0,
    stone_charges NUMERIC(12, 2) DEFAULT 0,
    metal_type VARCHAR(64),
    item_code VARCHAR(128),
    image_url TEXT,
    attr_color VARCHAR(128),
    attr_stone VARCHAR(128),
    fixed_price NUMERIC(14, 2),
    status VARCHAR(32) NOT NULL DEFAULT 'in_stock',
    sold_bill_id INTEGER REFERENCES reseller_erp_bills(id) ON DELETE SET NULL,
    payload_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT reseller_erp_stock_pieces_status_chk
        CHECK (status IN ('in_stock', 'sold', 'reserved', 'cancelled'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_reseller_erp_stock_pieces_barcode
    ON reseller_erp_stock_pieces (reseller_user_id, barcode);

CREATE INDEX IF NOT EXISTS idx_reseller_erp_stock_pieces_item_code
    ON reseller_erp_stock_pieces (reseller_user_id, item_code, status);

CREATE INDEX IF NOT EXISTS idx_reseller_erp_stock_pieces_batch
    ON reseller_erp_stock_pieces (batch_id);
