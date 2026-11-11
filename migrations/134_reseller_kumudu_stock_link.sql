-- Migration 134: Kumudu software stock link (per-reseller, default off)
-- Admin toggle on B2B reseller profile. Mapping + inbound API for catalogue / product / stock.

ALTER TABLE users
    ADD COLUMN IF NOT EXISTS reseller_kumudu_stock_link_enabled BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN users.reseller_kumudu_stock_link_enabled IS
    'When true, this reseller gets Profile → Kumudu software stock link and can receive Kumudu catalogue/product/stock webhooks.';

CREATE TABLE IF NOT EXISTS reseller_kumudu_link (
    id SERIAL PRIMARY KEY,
    reseller_user_id INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    inbound_key VARCHAR(64) NOT NULL,
    api_key VARCHAR(128) NOT NULL,
    store_id VARCHAR(128),
    catalogue_mapping JSONB NOT NULL DEFAULT '{}'::jsonb,
    product_mapping JSONB NOT NULL DEFAULT '{}'::jsonb,
    stock_mapping JSONB NOT NULL DEFAULT '{}'::jsonb,
    sample_catalogue_payload JSONB,
    sample_product_payload JSONB,
    sample_stock_payload JSONB,
    last_catalogue_at TIMESTAMPTZ,
    last_product_at TIMESTAMPTZ,
    last_stock_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_reseller_kumudu_link_inbound_key
    ON reseller_kumudu_link (LOWER(TRIM(inbound_key)));

CREATE INDEX IF NOT EXISTS idx_reseller_kumudu_link_api_key
    ON reseller_kumudu_link (api_key);

CREATE TABLE IF NOT EXISTS reseller_kumudu_events (
    id SERIAL PRIMARY KEY,
    reseller_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    endpoint VARCHAR(32) NOT NULL,
    status VARCHAR(16) NOT NULL DEFAULT 'ok',
    summary TEXT,
    payload JSONB,
    result JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_reseller_kumudu_events_reseller
    ON reseller_kumudu_events (reseller_user_id, created_at DESC);

DO $$
BEGIN
    RAISE NOTICE '✅ Migration 134 completed: reseller_kumudu_stock_link_enabled + mapping tables';
END $$;
