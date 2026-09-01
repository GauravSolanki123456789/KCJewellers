-- Reseller live stock visibility on catalog + shared catalogues
ALTER TABLE users
    ADD COLUMN IF NOT EXISTS reseller_show_live_stock BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE shared_catalogs
    ADD COLUMN IF NOT EXISTS show_live_stock BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN users.reseller_show_live_stock IS
    'When true, reseller product cards show PCS from web_products.quantity; shared catalogues cap qty selection.';

COMMENT ON COLUMN shared_catalogs.show_live_stock IS
    'Snapshot of users.reseller_show_live_stock when the shared catalogue link was created.';
