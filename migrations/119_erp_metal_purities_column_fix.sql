-- Repair metal routing tables if 118 created an older shape (CREATE IF NOT EXISTS skips new columns).

ALTER TABLE reseller_erp_metal_purities
  ADD COLUMN IF NOT EXISTS metal_type VARCHAR(16) NOT NULL DEFAULT 'silver';

ALTER TABLE reseller_erp_metal_purities
  ADD COLUMN IF NOT EXISTS default_charge_pct NUMERIC(8, 4);

ALTER TABLE reseller_erp_metal_purities
  ADD COLUMN IF NOT EXISTS sort_order INTEGER NOT NULL DEFAULT 0;

ALTER TABLE reseller_erp_metal_purities
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE reseller_erp_metal_purities
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE reseller_erp_metal_purities
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE UNIQUE INDEX IF NOT EXISTS idx_metal_purities_label
  ON reseller_erp_metal_purities (reseller_user_id, metal_type, lower(trim(label)));

ALTER TABLE reseller_erp_metal_stock_lots
  ADD COLUMN IF NOT EXISTS charge_pct NUMERIC(8, 4);

ALTER TABLE reseller_erp_metal_stock_lots
  ADD COLUMN IF NOT EXISTS pure_gm NUMERIC(14, 3) NOT NULL DEFAULT 0;

ALTER TABLE reseller_erp_metal_stock_lots
  ADD COLUMN IF NOT EXISTS status VARCHAR(16) NOT NULL DEFAULT 'active';

ALTER TABLE reseller_erp_metal_stock_lots
  ADD COLUMN IF NOT EXISTS move_date DATE NOT NULL DEFAULT CURRENT_DATE;
