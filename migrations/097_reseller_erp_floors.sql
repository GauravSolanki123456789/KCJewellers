-- ERP floor / box location tracking (reseller stock only — not catalogue inventory).
CREATE TABLE IF NOT EXISTS reseller_erp_floors (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    reseller_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    code VARCHAR(64) NOT NULL,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_reseller_erp_floors_code
    ON reseller_erp_floors (reseller_user_id, lower(code));

CREATE INDEX IF NOT EXISTS idx_reseller_erp_floors_reseller
    ON reseller_erp_floors (reseller_user_id, name);

CREATE TABLE IF NOT EXISTS reseller_erp_boxes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    floor_id UUID NOT NULL REFERENCES reseller_erp_floors(id) ON DELETE CASCADE,
    reseller_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    code VARCHAR(128) NOT NULL,
    label VARCHAR(255),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_reseller_erp_boxes_code
    ON reseller_erp_boxes (reseller_user_id, lower(code));

CREATE INDEX IF NOT EXISTS idx_reseller_erp_boxes_floor
    ON reseller_erp_boxes (floor_id);

ALTER TABLE reseller_erp_stock_pieces ADD COLUMN IF NOT EXISTS floor_id UUID REFERENCES reseller_erp_floors(id) ON DELETE SET NULL;
ALTER TABLE reseller_erp_stock_pieces ADD COLUMN IF NOT EXISTS box_id UUID REFERENCES reseller_erp_boxes(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_reseller_erp_stock_pieces_floor
    ON reseller_erp_stock_pieces (reseller_user_id, floor_id) WHERE floor_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_reseller_erp_stock_pieces_box
    ON reseller_erp_stock_pieces (reseller_user_id, box_id) WHERE box_id IS NOT NULL;
