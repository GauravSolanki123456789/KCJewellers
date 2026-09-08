-- Payment ledger: lane scope (Jainav) + duplicate-safe bank import references

ALTER TABLE reseller_erp_ledger_entries
  ADD COLUMN IF NOT EXISTS ledger_scope VARCHAR(16) NOT NULL DEFAULT 'official';

CREATE INDEX IF NOT EXISTS idx_reseller_erp_ledger_entries_scope
  ON reseller_erp_ledger_entries (reseller_user_id, ledger_scope, entry_date DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_reseller_erp_ledger_entries_ref_dedupe
  ON reseller_erp_ledger_entries (reseller_user_id, reference_no, entry_date, amount_inr, entry_type)
  WHERE reference_no IS NOT NULL AND reference_no <> '';
