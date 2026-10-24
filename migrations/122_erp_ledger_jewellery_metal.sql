-- Gold vs silver on ledger entries (payments, PV, conversions).
ALTER TABLE reseller_erp_ledger_entries
  ADD COLUMN IF NOT EXISTS jewellery_metal VARCHAR(16);
