-- ERP operator: allow/disallow "Save bill" in Scan & Bill (estimates still allowed).
ALTER TABLE reseller_erp_operators
    ADD COLUMN IF NOT EXISTS can_save_bill BOOLEAN NOT NULL DEFAULT true;
