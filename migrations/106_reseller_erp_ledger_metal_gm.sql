-- Dual-currency lane ledger: jewellery metal in grams alongside ₹.

ALTER TABLE reseller_erp_ledger_entries
  ADD COLUMN IF NOT EXISTS metal_gm NUMERIC(14, 3);

CREATE INDEX IF NOT EXISTS idx_reseller_erp_ledger_entries_metal
  ON reseller_erp_ledger_entries (reseller_user_id, customer_id)
  WHERE metal_gm IS NOT NULL AND metal_gm <> 0;
