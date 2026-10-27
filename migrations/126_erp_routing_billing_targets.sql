-- Billing queue, salesperson targets, purchase weights on interactions.

ALTER TABLE reseller_erp_visit_interactions
    ADD COLUMN IF NOT EXISTS estimation_number VARCHAR(64),
    ADD COLUMN IF NOT EXISTS gross_weight_gm NUMERIC(12, 3),
    ADD COLUMN IF NOT EXISTS net_weight_gm NUMERIC(12, 3);

CREATE TABLE IF NOT EXISTS reseller_erp_visit_billing_queue (
    id SERIAL PRIMARY KEY,
    reseller_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    visit_id INTEGER NOT NULL REFERENCES reseller_erp_customer_visits(id) ON DELETE CASCADE,
    interaction_id INTEGER REFERENCES reseller_erp_visit_interactions(id) ON DELETE SET NULL,
    customer_id INTEGER NOT NULL REFERENCES reseller_erp_customers(id) ON DELETE CASCADE,
    counter_id INTEGER REFERENCES reseller_erp_store_counters(id) ON DELETE SET NULL,
    operator_id INTEGER REFERENCES reseller_erp_operators(id) ON DELETE SET NULL,
    estimation_number VARCHAR(64),
    estimated_amount_inr NUMERIC(14, 2),
    gross_weight_gm NUMERIC(12, 3),
    net_weight_gm NUMERIC(12, 3),
    billing_status VARCHAR(24) NOT NULL DEFAULT 'pending',
    invoice_number VARCHAR(64),
    payment_status VARCHAR(24) NOT NULL DEFAULT 'unpaid',
    payment_mode VARCHAR(32),
    payment_amount_inr NUMERIC(14, 2),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMPTZ,
    completed_by_operator_id INTEGER REFERENCES reseller_erp_operators(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_erp_billing_queue_reseller_status
    ON reseller_erp_visit_billing_queue (reseller_user_id, billing_status, created_at DESC);

CREATE TABLE IF NOT EXISTS reseller_erp_operator_sales_targets (
    id SERIAL PRIMARY KEY,
    reseller_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    operator_id INTEGER NOT NULL REFERENCES reseller_erp_operators(id) ON DELETE CASCADE,
    period_type VARCHAR(16) NOT NULL,
    period_key VARCHAR(16) NOT NULL,
    target_amount_inr NUMERIC(14, 2) NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (reseller_user_id, operator_id, period_type, period_key)
);
