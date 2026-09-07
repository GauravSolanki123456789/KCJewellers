-- Design master: fixed price + per-size MRP variants (gift items)
ALTER TABLE reseller_erp_design_skus
  ADD COLUMN IF NOT EXISTS fixed_price NUMERIC(12, 2);

CREATE TABLE IF NOT EXISTS reseller_erp_design_sku_sizes (
  id SERIAL PRIMARY KEY,
  reseller_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  sku_id INTEGER NOT NULL REFERENCES reseller_erp_design_skus(id) ON DELETE CASCADE,
  size_label VARCHAR(128) NOT NULL,
  fixed_price_mrp NUMERIC(12, 2),
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (sku_id, size_label)
);

CREATE INDEX IF NOT EXISTS idx_reseller_erp_design_sku_sizes_sku
  ON reseller_erp_design_sku_sizes (sku_id);
