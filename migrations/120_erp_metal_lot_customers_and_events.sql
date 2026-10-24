-- Metal routing: customer custody + lot journey audit log.

ALTER TABLE reseller_erp_metal_stock_lots
  ADD COLUMN IF NOT EXISTS from_customer_id INTEGER REFERENCES reseller_erp_customers(id) ON DELETE SET NULL;

ALTER TABLE reseller_erp_metal_stock_lots
  ADD COLUMN IF NOT EXISTS held_by_customer_id INTEGER REFERENCES reseller_erp_customers(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS reseller_erp_metal_lot_events (
    id SERIAL PRIMARY KEY,
    reseller_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    lot_id INTEGER NOT NULL REFERENCES reseller_erp_metal_stock_lots(id) ON DELETE CASCADE,
    event_type VARCHAR(32) NOT NULL,
    gross_gm NUMERIC(14, 3),
    from_counter_id INTEGER REFERENCES reseller_erp_metal_routing_counters(id) ON DELETE SET NULL,
    to_counter_id INTEGER REFERENCES reseller_erp_metal_routing_counters(id) ON DELETE SET NULL,
    from_operator_id INTEGER REFERENCES reseller_erp_operators(id) ON DELETE SET NULL,
    to_operator_id INTEGER REFERENCES reseller_erp_operators(id) ON DELETE SET NULL,
    from_customer_id INTEGER REFERENCES reseller_erp_customers(id) ON DELETE SET NULL,
    to_customer_id INTEGER REFERENCES reseller_erp_customers(id) ON DELETE SET NULL,
    notes TEXT,
    created_by_operator_id INTEGER REFERENCES reseller_erp_operators(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_metal_lot_events_lot
  ON reseller_erp_metal_lot_events (reseller_user_id, lot_id, created_at DESC);
