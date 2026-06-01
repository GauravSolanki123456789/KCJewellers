-- ============================================
-- Migration 041: Reseller product upload queue
-- Gaurav Softwares - KC Jewellers
-- ============================================
-- Resellers submit products (same fields as ERP sync); admin approves before live on web_products.
-- ============================================

ALTER TABLE users ADD COLUMN IF NOT EXISTS reseller_product_uploads_enabled BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS reseller_product_submissions (
    id SERIAL PRIMARY KEY,
    submitted_by_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    submission_status VARCHAR(32) NOT NULL DEFAULT 'pending'
        CHECK (submission_status IN ('pending', 'approved', 'rejected', 'withdrawn')),
    batch_id UUID,
    -- ERP / sync field names (camelCase aliases stored in payload_json)
    style_code VARCHAR(255),
    sku VARCHAR(255),
    barcode VARCHAR(255),
    product_name VARCHAR(255),
    size VARCHAR(64),
    net_weight NUMERIC(10, 3),
    gross_weight NUMERIC(10, 3),
    purity VARCHAR(50),
    mc_rate NUMERIC(12, 2),
    mc_type VARCHAR(50),
    metal_type VARCHAR(50) DEFAULT 'silver',
    fixed_price NUMERIC(12, 2) DEFAULT 0,
    stone_charges NUMERIC(12, 2) DEFAULT 0,
    box_charges NUMERIC(12, 2) DEFAULT 0,
    quantity INTEGER NOT NULL DEFAULT 1,
    design_group VARCHAR(255),
    attr_color VARCHAR(255),
    attr_stone VARCHAR(255),
    image_url TEXT,
    secondary_image_url TEXT,
    payload_json JSONB,
    web_product_sku VARCHAR(255),
    review_notes TEXT,
    reviewed_at TIMESTAMPTZ,
    reviewed_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_reseller_product_submissions_status
    ON reseller_product_submissions (submission_status);

CREATE INDEX IF NOT EXISTS idx_reseller_product_submissions_submitter
    ON reseller_product_submissions (submitted_by_user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_reseller_product_submissions_batch
    ON reseller_product_submissions (batch_id)
    WHERE batch_id IS NOT NULL;

ALTER TABLE web_products ADD COLUMN IF NOT EXISTS submitted_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE web_products ADD COLUMN IF NOT EXISTS reseller_submission_id INTEGER REFERENCES reseller_product_submissions(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_web_products_submitted_by
    ON web_products (submitted_by_user_id)
    WHERE submitted_by_user_id IS NOT NULL;

DO $$
BEGIN
    RAISE NOTICE '✅ Migration 041 completed: reseller_product_submissions, reseller_product_uploads_enabled';
END $$;
