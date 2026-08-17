-- Admin toggle per RESELLER + RFID tag on ERP stock pieces (Posh RFID integration)
ALTER TABLE users ADD COLUMN IF NOT EXISTS reseller_rfid_enabled BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE reseller_erp_stock_pieces ADD COLUMN IF NOT EXISTS rfid_tag VARCHAR(64);

-- One active RFID tag per reseller (reusable when piece sold / barcode deleted)
CREATE UNIQUE INDEX IF NOT EXISTS idx_reseller_erp_stock_pieces_rfid_active
    ON reseller_erp_stock_pieces (reseller_user_id, lower(rfid_tag))
    WHERE rfid_tag IS NOT NULL AND status = 'in_stock';

DO $$
BEGIN
    RAISE NOTICE '✅ Migration 094 completed: reseller_rfid_enabled + stock piece rfid_tag';
END $$;
