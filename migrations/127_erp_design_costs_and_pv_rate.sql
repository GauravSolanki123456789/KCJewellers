-- Design-master cost fields (profit) + purchase-voucher metal rate per gram.

ALTER TABLE reseller_erp_design_skus
    ADD COLUMN IF NOT EXISTS mrp_cost NUMERIC(14, 2),
    ADD COLUMN IF NOT EXISTS metal_cost_pct NUMERIC(8, 4),
    ADD COLUMN IF NOT EXISTS mc_cost NUMERIC(14, 2),
    ADD COLUMN IF NOT EXISTS wastage_cost_pct NUMERIC(8, 4);

ALTER TABLE reseller_erp_purchase_vouchers
    ADD COLUMN IF NOT EXISTS metal_rate_per_gm NUMERIC(14, 4);

UPDATE reseller_erp_purchase_vouchers
SET metal_rate_per_gm = ROUND((amount_inr / (weight_kg * 1000))::numeric, 4)
WHERE metal_rate_per_gm IS NULL
  AND amount_inr > 0
  AND weight_kg > 0;
