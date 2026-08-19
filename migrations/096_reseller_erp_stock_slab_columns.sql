-- Per-piece ERP slab MC rates and metal weight % (R / W / F) from stock Excel upload.
ALTER TABLE reseller_erp_stock_pieces ADD COLUMN IF NOT EXISTS mc_rate_slab_r NUMERIC(12, 2);
ALTER TABLE reseller_erp_stock_pieces ADD COLUMN IF NOT EXISTS mc_rate_slab_w NUMERIC(12, 2);
ALTER TABLE reseller_erp_stock_pieces ADD COLUMN IF NOT EXISTS mc_rate_slab_f NUMERIC(12, 2);
ALTER TABLE reseller_erp_stock_pieces ADD COLUMN IF NOT EXISTS metal_slab_r_pct NUMERIC(8, 3);
ALTER TABLE reseller_erp_stock_pieces ADD COLUMN IF NOT EXISTS metal_slab_w_pct NUMERIC(8, 3);
ALTER TABLE reseller_erp_stock_pieces ADD COLUMN IF NOT EXISTS metal_slab_f_pct NUMERIC(8, 3);
