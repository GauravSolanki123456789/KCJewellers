-- Karigar registry + order job tracking for reseller ERP order management

CREATE TABLE IF NOT EXISTS reseller_erp_karigars (
    id SERIAL PRIMARY KEY,
    reseller_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    mobile VARCHAR(32),
    specialty VARCHAR(128),
    address TEXT,
    notes TEXT,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_reseller_erp_karigars_reseller
    ON reseller_erp_karigars (reseller_user_id, is_active, name);

CREATE TABLE IF NOT EXISTS reseller_erp_order_jobs (
    id SERIAL PRIMARY KEY,
    reseller_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    bill_id INTEGER NOT NULL REFERENCES reseller_erp_bills(id) ON DELETE CASCADE,
    current_karigar_id INTEGER REFERENCES reseller_erp_karigars(id) ON DELETE SET NULL,
    status VARCHAR(32) NOT NULL DEFAULT 'in_shop',
    work_description TEXT,
    due_date DATE,
    history_json JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (bill_id)
);

CREATE INDEX IF NOT EXISTS idx_reseller_erp_order_jobs_reseller
    ON reseller_erp_order_jobs (reseller_user_id, status, updated_at DESC);
