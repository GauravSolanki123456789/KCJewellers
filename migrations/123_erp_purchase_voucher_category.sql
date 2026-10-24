-- PV stock category (Metal, Item, Repair, etc.) when ledger-in-metal is enabled.
ALTER TABLE reseller_erp_purchase_vouchers
  ADD COLUMN IF NOT EXISTS pv_category VARCHAR(32);
