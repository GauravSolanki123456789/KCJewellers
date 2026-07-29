-- Reseller ERP package — admin gate + core jewellery ERP tables (per reseller).

ALTER TABLE users
    ADD COLUMN IF NOT EXISTS reseller_erp_enabled BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS reseller_erp_customers (
    id SERIAL PRIMARY KEY,
    reseller_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    mobile VARCHAR(32),
    email VARCHAR(255),
    gstin VARCHAR(20),
    address TEXT,
    birthdate DATE,
    anniversary_date DATE,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_reseller_erp_customers_reseller
    ON reseller_erp_customers (reseller_user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_reseller_erp_customers_mobile
    ON reseller_erp_customers (reseller_user_id, mobile);

CREATE TABLE IF NOT EXISTS reseller_erp_settings (
    reseller_user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    settings JSONB NOT NULL DEFAULT '{}'::jsonb,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS reseller_erp_bills (
    id SERIAL PRIMARY KEY,
    reseller_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    bill_number VARCHAR(64) NOT NULL,
    bill_type VARCHAR(32) NOT NULL DEFAULT 'sale',
    customer_id INTEGER REFERENCES reseller_erp_customers(id) ON DELETE SET NULL,
    customer_name VARCHAR(255),
    total_inr NUMERIC(14, 2) NOT NULL DEFAULT 0,
    status VARCHAR(32) NOT NULL DEFAULT 'draft',
    lines_json JSONB NOT NULL DEFAULT '[]'::jsonb,
    notes TEXT,
    bill_date DATE NOT NULL DEFAULT CURRENT_DATE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_reseller_erp_bills_reseller
    ON reseller_erp_bills (reseller_user_id, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_reseller_erp_bills_number
    ON reseller_erp_bills (reseller_user_id, bill_number);

CREATE TABLE IF NOT EXISTS reseller_erp_stock_alerts (
    id SERIAL PRIMARY KEY,
    reseller_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    product_barcode VARCHAR(128),
    product_sku VARCHAR(128),
    product_name VARCHAR(255),
    reorder_level NUMERIC(12, 3) NOT NULL DEFAULT 0,
    current_qty NUMERIC(12, 3) NOT NULL DEFAULT 0,
    notes TEXT,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_reseller_erp_stock_barcode
    ON reseller_erp_stock_alerts (reseller_user_id, product_barcode)
    WHERE product_barcode IS NOT NULL AND TRIM(product_barcode) <> '';
