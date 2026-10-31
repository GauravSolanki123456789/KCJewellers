-- CRM campaigns (birthday / anniversary WhatsApp) and savings schemes

CREATE TABLE IF NOT EXISTS reseller_erp_crm_campaigns (
    id SERIAL PRIMARY KEY,
    reseller_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    occasion VARCHAR(32) NOT NULL DEFAULT 'custom',
    name VARCHAR(255) NOT NULL,
    message TEXT NOT NULL DEFAULT '',
    image_url TEXT,
    discount_pct NUMERIC(6, 2) NOT NULL DEFAULT 0,
    coupon_code VARCHAR(64),
    uses_per_year INTEGER NOT NULL DEFAULT 1,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_erp_crm_campaigns_owner
    ON reseller_erp_crm_campaigns (reseller_user_id, is_active, occasion);

CREATE TABLE IF NOT EXISTS reseller_erp_crm_coupon_uses (
    id SERIAL PRIMARY KEY,
    reseller_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    campaign_id INTEGER NOT NULL REFERENCES reseller_erp_crm_campaigns(id) ON DELETE CASCADE,
    customer_id INTEGER NOT NULL REFERENCES reseller_erp_customers(id) ON DELETE CASCADE,
    used_year INTEGER NOT NULL,
    used_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_erp_crm_coupon_uses_year
    ON reseller_erp_crm_coupon_uses (campaign_id, customer_id, used_year);

CREATE TABLE IF NOT EXISTS reseller_erp_schemes (
    id SERIAL PRIMARY KEY,
    reseller_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    details TEXT,
    sort_order INTEGER NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_erp_schemes_owner
    ON reseller_erp_schemes (reseller_user_id, is_active, sort_order);

CREATE TABLE IF NOT EXISTS reseller_erp_visit_scheme_logs (
    id SERIAL PRIMARY KEY,
    reseller_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    visit_id INTEGER REFERENCES reseller_erp_customer_visits(id) ON DELETE SET NULL,
    interaction_id INTEGER REFERENCES reseller_erp_visit_interactions(id) ON DELETE SET NULL,
    operator_id INTEGER REFERENCES reseller_erp_operators(id) ON DELETE SET NULL,
    scheme_id INTEGER NOT NULL REFERENCES reseller_erp_schemes(id) ON DELETE CASCADE,
    explained BOOLEAN NOT NULL DEFAULT true,
    interested BOOLEAN NOT NULL DEFAULT false,
    joined BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_erp_visit_scheme_logs_owner
    ON reseller_erp_visit_scheme_logs (reseller_user_id, created_at DESC);
