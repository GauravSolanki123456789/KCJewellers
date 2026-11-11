-- Migration 135: Kumudu sync confirm IDs (per reseller shop prefix, e.g. jp-cat-…)

CREATE TABLE IF NOT EXISTS reseller_kumudu_sync_records (
    id SERIAL PRIMARY KEY,
    reseller_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    shop_key VARCHAR(32) NOT NULL,
    sync_kind VARCHAR(24) NOT NULL,
    sync_id VARCHAR(80) NOT NULL,
    batch_sync_id VARCHAR(80),
    endpoint VARCHAR(32) NOT NULL,
    action VARCHAR(48),
    web_category_id INTEGER REFERENCES web_categories(id) ON DELETE SET NULL,
    web_subcategory_id INTEGER REFERENCES web_subcategories(id) ON DELETE SET NULL,
    web_product_id INTEGER REFERENCES web_products(id) ON DELETE SET NULL,
    style_code VARCHAR(255),
    sku_subcategory VARCHAR(255),
    product_sku VARCHAR(255),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT reseller_kumudu_sync_records_sync_id_key UNIQUE (sync_id)
);

CREATE INDEX IF NOT EXISTS idx_reseller_kumudu_sync_reseller
    ON reseller_kumudu_sync_records (reseller_user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_reseller_kumudu_sync_batch
    ON reseller_kumudu_sync_records (batch_sync_id)
    WHERE batch_sync_id IS NOT NULL;

DO $$
BEGIN
    RAISE NOTICE '✅ Migration 135: reseller_kumudu_sync_records';
END $$;
