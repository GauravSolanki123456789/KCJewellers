-- Gift / reseller rows: display size in inches on catalogue cards and PDP.
ALTER TABLE web_products ADD COLUMN IF NOT EXISTS size VARCHAR(64);
