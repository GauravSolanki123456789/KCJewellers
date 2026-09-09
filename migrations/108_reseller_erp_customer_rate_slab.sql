ALTER TABLE reseller_erp_customers
    ADD COLUMN IF NOT EXISTS rate_slab VARCHAR(1);

UPDATE reseller_erp_customers
SET rate_slab = 'R'
WHERE rate_slab IS NULL OR TRIM(rate_slab) = '';
