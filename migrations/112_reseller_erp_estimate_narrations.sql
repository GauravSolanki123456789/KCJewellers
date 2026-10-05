-- Estimate narration options (billing dropdown + tracking; not on PDF)

CREATE TABLE IF NOT EXISTS reseller_erp_estimate_narrations (
    id SERIAL PRIMARY KEY,
    reseller_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    label VARCHAR(255) NOT NULL,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_reseller_erp_estimate_narrations_reseller
    ON reseller_erp_estimate_narrations (reseller_user_id, sort_order, id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_reseller_erp_estimate_narrations_label
    ON reseller_erp_estimate_narrations (
        reseller_user_id,
        lower(trim(label))
    );
