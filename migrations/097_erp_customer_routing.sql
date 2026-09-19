-- Customer routing & staff management (store counters, visits, queue)

ALTER TABLE reseller_erp_operators
    ADD COLUMN IF NOT EXISTS is_store_greeter BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS reseller_erp_store_counters (
    id SERIAL PRIMARY KEY,
    reseller_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(128) NOT NULL,
    sort_order INTEGER NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT true,
    incharge_operator_id INTEGER REFERENCES reseller_erp_operators(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (reseller_user_id, slug)
);

CREATE INDEX IF NOT EXISTS idx_erp_store_counters_owner
    ON reseller_erp_store_counters (reseller_user_id, is_active, sort_order);

CREATE TABLE IF NOT EXISTS reseller_erp_customer_visits (
    id SERIAL PRIMARY KEY,
    reseller_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    customer_id INTEGER NOT NULL REFERENCES reseller_erp_customers(id) ON DELETE CASCADE,
    status VARCHAR(32) NOT NULL DEFAULT 'active',
    greeter_operator_id INTEGER REFERENCES reseller_erp_operators(id) ON DELETE SET NULL,
    started_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    ended_at TIMESTAMPTZ,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_erp_customer_visits_owner_status
    ON reseller_erp_customer_visits (reseller_user_id, status, started_at DESC);

CREATE TABLE IF NOT EXISTS reseller_erp_visit_queue (
    id SERIAL PRIMARY KEY,
    visit_id INTEGER NOT NULL REFERENCES reseller_erp_customer_visits(id) ON DELETE CASCADE,
    counter_id INTEGER NOT NULL REFERENCES reseller_erp_store_counters(id) ON DELETE CASCADE,
    status VARCHAR(24) NOT NULL DEFAULT 'waiting',
    queued_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    assigned_operator_id INTEGER REFERENCES reseller_erp_operators(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_erp_visit_queue_counter_status
    ON reseller_erp_visit_queue (counter_id, status, queued_at);

CREATE TABLE IF NOT EXISTS reseller_erp_visit_interactions (
    id SERIAL PRIMARY KEY,
    visit_id INTEGER NOT NULL REFERENCES reseller_erp_customer_visits(id) ON DELETE CASCADE,
    queue_id INTEGER REFERENCES reseller_erp_visit_queue(id) ON DELETE SET NULL,
    counter_id INTEGER REFERENCES reseller_erp_store_counters(id) ON DELETE SET NULL,
    operator_id INTEGER REFERENCES reseller_erp_operators(id) ON DELETE SET NULL,
    outcome VARCHAR(32) NOT NULL,
    bill_number VARCHAR(64),
    bill_amount_inr NUMERIC(14, 2),
    purchase_notes TEXT,
    no_sale_reason TEXT,
    forward_counter_id INTEGER REFERENCES reseller_erp_store_counters(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_erp_visit_interactions_visit
    ON reseller_erp_visit_interactions (visit_id, created_at);
