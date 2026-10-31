-- Per-reseller catalogue price overrides (gift MRP + silver wastage/MC or fixed MRP)

ALTER TABLE users
    ADD COLUMN IF NOT EXISTS reseller_own_prices_enabled BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN users.reseller_own_prices_enabled IS
    'Admin toggle: reseller may set own gift-item MRP and optional silver fixed MRP / wastage+MC for their website, shared catalogues, PDFs and WhatsApp.';

CREATE TABLE IF NOT EXISTS reseller_product_price_overrides (
    id SERIAL PRIMARY KEY,
    reseller_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    product_id INTEGER NOT NULL REFERENCES web_products(id) ON DELETE CASCADE,
    mode VARCHAR(24) NOT NULL DEFAULT 'fixed_mrp',
    fixed_price NUMERIC(14, 2),
    wastage_pct NUMERIC(8, 3),
    mc_rate NUMERIC(14, 4),
    mc_type VARCHAR(32),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (reseller_user_id, product_id)
);

CREATE INDEX IF NOT EXISTS idx_reseller_price_overrides_owner
    ON reseller_product_price_overrides (reseller_user_id);

CREATE INDEX IF NOT EXISTS idx_reseller_price_overrides_product
    ON reseller_product_price_overrides (product_id);
