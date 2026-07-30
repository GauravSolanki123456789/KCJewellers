-- Persist billing session (slab, rates, customer mobile) for estimate edit/resume.

ALTER TABLE reseller_erp_bills
    ADD COLUMN IF NOT EXISTS session_json JSONB DEFAULT NULL;
