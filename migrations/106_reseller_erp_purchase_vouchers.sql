-- Purchase vouchers (PV0001…), employees, ledger extensions, stock batch link

CREATE TABLE IF NOT EXISTS reseller_erp_purchase_vouchers (
    id SERIAL PRIMARY KEY,
    reseller_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    pv_number VARCHAR(32) NOT NULL,
    entry_date DATE NOT NULL DEFAULT CURRENT_DATE,
    vendor_name VARCHAR(255),
    vendor_bill_ref VARCHAR(120),
    amount_inr NUMERIC(14, 2) NOT NULL DEFAULT 0,
    weight_kg NUMERIC(12, 3) NOT NULL DEFAULT 0,
    received_weight_kg NUMERIC(12, 3) NOT NULL DEFAULT 0,
    metal_type VARCHAR(32),
    narration TEXT,
    ledger_entry_id INTEGER,
    status VARCHAR(32) NOT NULL DEFAULT 'open',
    stock_batch_id UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (reseller_user_id, pv_number)
);

CREATE INDEX IF NOT EXISTS idx_reseller_erp_purchase_vouchers_reseller
    ON reseller_erp_purchase_vouchers (reseller_user_id, entry_date DESC);

CREATE TABLE IF NOT EXISTS reseller_erp_employees (
    id SERIAL PRIMARY KEY,
    reseller_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    mobile VARCHAR(20),
    role_label VARCHAR(120),
    active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_reseller_erp_employees_reseller
    ON reseller_erp_employees (reseller_user_id, name);

ALTER TABLE reseller_erp_ledger_entries
    ADD COLUMN IF NOT EXISTS pv_id INTEGER,
    ADD COLUMN IF NOT EXISTS employee_id INTEGER,
    ADD COLUMN IF NOT EXISTS weight_kg NUMERIC(12, 3);

ALTER TABLE reseller_erp_stock_batches
    ADD COLUMN IF NOT EXISTS purchase_voucher_id INTEGER;
