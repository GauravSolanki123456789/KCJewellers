-- Allow Jainav / lane-reserved stock pieces (shadow billing without marking sold).

ALTER TABLE reseller_erp_stock_pieces
    DROP CONSTRAINT IF EXISTS reseller_erp_stock_pieces_status_chk;

ALTER TABLE reseller_erp_stock_pieces
    ADD CONSTRAINT reseller_erp_stock_pieces_status_chk
    CHECK (status IN ('in_stock', 'sold', 'reserved', 'cancelled', 'lane'));
