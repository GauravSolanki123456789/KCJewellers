-- Slab R1 metal fraction (same semantics as metal_slab_w_pct: 1 = 100%, 0.91 = 91%).
ALTER TABLE reseller_erp_stock_pieces ADD COLUMN IF NOT EXISTS metal_slab_r1_pct NUMERIC(8, 4);
ALTER TABLE reseller_erp_design_skus ADD COLUMN IF NOT EXISTS metal_slab_r1_pct NUMERIC(8, 4);

COMMENT ON COLUMN reseller_erp_stock_pieces.metal_slab_r1_pct IS 'Fraction of net weight for Slab R1 billing (1 = 100%, 0.91 = 91%).';
COMMENT ON COLUMN reseller_erp_design_skus.metal_slab_r1_pct IS 'Design default metal fraction for Slab R1.';
