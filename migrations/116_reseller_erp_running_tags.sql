-- One-time 9-digit running tags for silver jewellery / silver articles (reseller ERP).

CREATE TABLE IF NOT EXISTS reseller_erp_running_tags (
    id SERIAL PRIMARY KEY,
    reseller_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    kind VARCHAR(24) NOT NULL,
    barcode VARCHAR(16) NOT NULL,
    balance_gm NUMERIC(14, 3) NOT NULL DEFAULT 0,
    generated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT reseller_erp_running_tags_kind_chk
        CHECK (kind IN ('jewellery', 'articles')),
    CONSTRAINT reseller_erp_running_tags_barcode_chk
        CHECK (barcode ~ '^[1-9][0-9]{8}$'),
    UNIQUE (reseller_user_id, kind),
    UNIQUE (reseller_user_id, barcode)
);

CREATE INDEX IF NOT EXISTS idx_reseller_erp_running_tags_reseller
    ON reseller_erp_running_tags (reseller_user_id);

-- Grams on PV need milligram precision (Excel wt like 18209.67 g).
ALTER TABLE reseller_erp_purchase_vouchers
    ALTER COLUMN weight_kg TYPE NUMERIC(14, 6),
    ALTER COLUMN received_weight_kg TYPE NUMERIC(14, 6);
ALTER TABLE reseller_erp_ledger_entries
    ALTER COLUMN weight_kg TYPE NUMERIC(14, 6);
