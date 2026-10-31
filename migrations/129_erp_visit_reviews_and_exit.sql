-- Customer exit reviews & left-shop exit types

CREATE TABLE IF NOT EXISTS reseller_erp_visit_review_options (
    id SERIAL PRIMARY KEY,
    reseller_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    label VARCHAR(200) NOT NULL,
    sort_order INTEGER NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_erp_visit_review_options_owner
    ON reseller_erp_visit_review_options (reseller_user_id, is_active, sort_order);

ALTER TABLE reseller_erp_visit_interactions
    ADD COLUMN IF NOT EXISTS exit_type VARCHAR(32),
    ADD COLUMN IF NOT EXISTS customer_review_option_ids INTEGER[],
    ADD COLUMN IF NOT EXISTS customer_review_note TEXT,
    ADD COLUMN IF NOT EXISTS customer_review_media JSONB,
    ADD COLUMN IF NOT EXISTS staff_collected_review BOOLEAN NOT NULL DEFAULT false;
