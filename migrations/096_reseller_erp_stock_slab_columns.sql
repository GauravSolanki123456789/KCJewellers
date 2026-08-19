-- Per-piece ERP billing slab overrides (from stock Excel upload).
ALTER TABLE reseller_erp_stock_pieces ADD COLUMN IF NOT EXISTS mc_rate_slab_r NUMERIC(12, 2);
ALTER TABLE reseller_erp_stock_pieces ADD COLUMN IF NOT EXISTS mc_rate_slab_w NUMERIC(12, 2);
ALTER TABLE reseller_erp_stock_pieces ADD COLUMN IF NOT EXISTS mc_rate_slab_f NUMERIC(12, 2);
ALTER TABLE reseller_erp_stock_pieces ADD COLUMN IF NOT EXISTS metal_slab_r_pct NUMERIC(8, 4);
ALTER TABLE reseller_erp_stock_pieces ADD COLUMN IF NOT EXISTS metal_slab_w_pct NUMERIC(8, 4);
ALTER TABLE reseller_erp_stock_pieces ADD COLUMN IF NOT EXISTS metal_slab_f_pct NUMERIC(8, 4);

COMMENT ON COLUMN reseller_erp_stock_pieces.metal_slab_r_pct IS 'Fraction of net weight for Slab R billing (1 = 100%, 0.94 = 94%).';
COMMENT ON COLUMN reseller_erp_stock_pieces.metal_slab_w_pct IS 'Fraction of net weight for Slab W billing.';
COMMENT ON COLUMN reseller_erp_stock_pieces.metal_slab_f_pct IS 'Fraction of net weight for Slab F billing.';
