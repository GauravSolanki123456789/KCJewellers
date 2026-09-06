-- Customer state for auto place-of-supply on GST bills
ALTER TABLE reseller_erp_customers
  ADD COLUMN IF NOT EXISTS state VARCHAR(64);
