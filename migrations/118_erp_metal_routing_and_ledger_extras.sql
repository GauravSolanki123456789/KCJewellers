-- Metal routing (grams), fixed-asset metal ledger flag, note narrations.

ALTER TABLE reseller_erp_operators
  ADD COLUMN IF NOT EXISTS is_metal_routing_manager BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE reseller_erp_ledger_entries
  ADD COLUMN IF NOT EXISTS fixed_asset_metal BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS reseller_erp_metal_routing_counters (
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

CREATE TABLE IF NOT EXISTS reseller_erp_metal_purities (
    id SERIAL PRIMARY KEY,
    reseller_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    metal_type VARCHAR(16) NOT NULL DEFAULT 'silver',
    label VARCHAR(64) NOT NULL,
    default_charge_pct NUMERIC(8, 4),
    sort_order INTEGER NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (reseller_user_id, metal_type, lower(trim(label)))
);

CREATE TABLE IF NOT EXISTS reseller_erp_metal_stock_lots (
    id SERIAL PRIMARY KEY,
    reseller_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    metal_type VARCHAR(16) NOT NULL,
    purity_id INTEGER REFERENCES reseller_erp_metal_purities(id) ON DELETE SET NULL,
    counter_id INTEGER REFERENCES reseller_erp_metal_routing_counters(id) ON DELETE SET NULL,
    operator_id INTEGER REFERENCES reseller_erp_operators(id) ON DELETE SET NULL,
    parent_lot_id INTEGER REFERENCES reseller_erp_metal_stock_lots(id) ON DELETE SET NULL,
    gross_gm NUMERIC(14, 3) NOT NULL DEFAULT 0,
    charge_pct NUMERIC(8, 4),
    pure_gm NUMERIC(14, 3) NOT NULL DEFAULT 0,
    status VARCHAR(16) NOT NULL DEFAULT 'active',
    notes TEXT,
    move_date DATE NOT NULL DEFAULT CURRENT_DATE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_metal_stock_lots_reseller
  ON reseller_erp_metal_stock_lots (reseller_user_id, metal_type, status);

CREATE TABLE IF NOT EXISTS reseller_erp_credit_note_narrations (
    id SERIAL PRIMARY KEY,
    reseller_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    label VARCHAR(255) NOT NULL,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_credit_note_narrations_label
  ON reseller_erp_credit_note_narrations (reseller_user_id, lower(trim(label)));

CREATE TABLE IF NOT EXISTS reseller_erp_debit_note_narrations (
    id SERIAL PRIMARY KEY,
    reseller_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    label VARCHAR(255) NOT NULL,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_debit_note_narrations_label
  ON reseller_erp_debit_note_narrations (reseller_user_id, lower(trim(label)));
