-- Metal routing: reusable lot numbers, categories, event category snapshot.

CREATE TABLE IF NOT EXISTS reseller_erp_metal_routing_categories (
    id SERIAL PRIMARY KEY,
    reseller_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(128) NOT NULL,
    sort_order INTEGER NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_metal_routing_categories_name
  ON reseller_erp_metal_routing_categories (reseller_user_id, lower(trim(name)));

ALTER TABLE reseller_erp_metal_stock_lots
  ADD COLUMN IF NOT EXISTS lot_number INTEGER;

ALTER TABLE reseller_erp_metal_stock_lots
  ADD COLUMN IF NOT EXISTS category_id INTEGER REFERENCES reseller_erp_metal_routing_categories(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_metal_stock_lots_lot_number
  ON reseller_erp_metal_stock_lots (reseller_user_id, lot_number)
  WHERE lot_number IS NOT NULL;

ALTER TABLE reseller_erp_metal_lot_events
  ADD COLUMN IF NOT EXISTS category_id INTEGER REFERENCES reseller_erp_metal_routing_categories(id) ON DELETE SET NULL;

-- Backfill lot_number for existing rows (per reseller, by id).
WITH numbered AS (
  SELECT id, reseller_user_id,
         ROW_NUMBER() OVER (PARTITION BY reseller_user_id ORDER BY id ASC) AS rn
  FROM reseller_erp_metal_stock_lots
  WHERE lot_number IS NULL
)
UPDATE reseller_erp_metal_stock_lots l
SET lot_number = numbered.rn
FROM numbered
WHERE l.id = numbered.id;
