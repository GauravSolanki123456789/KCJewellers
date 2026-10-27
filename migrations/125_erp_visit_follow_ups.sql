-- Optional follow-ups after no-purchase / left-shop outcomes (staff routing CRM).

CREATE TABLE IF NOT EXISTS reseller_erp_visit_follow_ups (
    id SERIAL PRIMARY KEY,
    reseller_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    customer_id INTEGER NOT NULL REFERENCES reseller_erp_customers(id) ON DELETE CASCADE,
    visit_id INTEGER REFERENCES reseller_erp_customer_visits(id) ON DELETE SET NULL,
    interaction_id INTEGER REFERENCES reseller_erp_visit_interactions(id) ON DELETE SET NULL,
    counter_id INTEGER REFERENCES reseller_erp_store_counters(id) ON DELETE SET NULL,
    operator_id INTEGER REFERENCES reseller_erp_operators(id) ON DELETE SET NULL,
    source VARCHAR(32) NOT NULL DEFAULT 'no_purchase',
    status VARCHAR(24) NOT NULL DEFAULT 'open',
    follow_up_at TIMESTAMPTZ,
    mode VARCHAR(32),
    priority VARCHAR(16) NOT NULL DEFAULT 'medium',
    remarks TEXT,
    result TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_erp_visit_follow_ups_reseller_status
    ON reseller_erp_visit_follow_ups (reseller_user_id, status, follow_up_at);
