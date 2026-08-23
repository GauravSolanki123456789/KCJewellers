-- ERP operator accounts (username/password per reseller) + shadow billing ledger.

CREATE TABLE IF NOT EXISTS reseller_erp_operators (
    id SERIAL PRIMARY KEY,
    reseller_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    username VARCHAR(64) NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    display_name VARCHAR(255),
    role VARCHAR(16) NOT NULL DEFAULT 'staff',
    allowed_modules TEXT[] NOT NULL DEFAULT '{}',
    full_access BOOLEAN NOT NULL DEFAULT false,
    shadow_access BOOLEAN NOT NULL DEFAULT false,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    last_login_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT reseller_erp_operators_role_chk CHECK (role IN ('admin', 'staff'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_reseller_erp_operators_username
    ON reseller_erp_operators (reseller_user_id, LOWER(username));

CREATE INDEX IF NOT EXISTS idx_reseller_erp_operators_reseller
    ON reseller_erp_operators (reseller_user_id, is_active, role);

-- Separate ledger for shadow-mode bills (Hitesh / Jainav lanes).
CREATE TABLE IF NOT EXISTS reseller_erp_shadow_bills (
    id SERIAL PRIMARY KEY,
    reseller_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    bill_number VARCHAR(64) NOT NULL,
    lane VARCHAR(16) NOT NULL,
    bill_type VARCHAR(32) NOT NULL DEFAULT 'sale',
    customer_id INTEGER REFERENCES reseller_erp_customers(id) ON DELETE SET NULL,
    customer_name VARCHAR(255),
    customer_gstin VARCHAR(20),
    payment_method VARCHAR(32),
    total_inr NUMERIC(14, 2) NOT NULL DEFAULT 0,
    status VARCHAR(32) NOT NULL DEFAULT 'completed',
    lines_json JSONB NOT NULL DEFAULT '[]'::jsonb,
    session_json JSONB DEFAULT NULL,
    notes TEXT,
    bill_date DATE NOT NULL DEFAULT CURRENT_DATE,
    created_by_operator_id INTEGER REFERENCES reseller_erp_operators(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT reseller_erp_shadow_bills_lane_chk CHECK (lane IN ('hitesh', 'jainav'))
);

CREATE INDEX IF NOT EXISTS idx_reseller_erp_shadow_bills_reseller
    ON reseller_erp_shadow_bills (reseller_user_id, lane, bill_date DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_reseller_erp_shadow_bills_number
    ON reseller_erp_shadow_bills (reseller_user_id, bill_number);
