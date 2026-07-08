-- Reseller WhatsApp / shared catalogue limits (admin-controlled per user)
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS reseller_catalog_max_products INTEGER NOT NULL DEFAULT 50;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS reseller_catalog_daily_limit INTEGER NOT NULL DEFAULT 10;

COMMENT ON COLUMN users.reseller_catalog_max_products IS
  'Max products a RESELLER may select per shared catalogue link (0 = unlimited up to platform cap 500).';

COMMENT ON COLUMN users.reseller_catalog_daily_limit IS
  'Max shared catalogue links a RESELLER may generate per calendar day in IST (0 = unlimited).';

-- Track customer shortlist → WhatsApp / PDF handoffs from /shared/[uuid]
CREATE TABLE IF NOT EXISTS shared_catalog_inquiries (
  id SERIAL PRIMARY KEY,
  shared_catalog_id UUID REFERENCES shared_catalogs(id) ON DELETE SET NULL,
  reseller_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  source VARCHAR(32) NOT NULL DEFAULT 'whatsapp',
  line_count INTEGER NOT NULL DEFAULT 0,
  total_pieces INTEGER NOT NULL DEFAULT 0,
  total_inr NUMERIC(14, 2),
  lines_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  catalog_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_shared_catalog_inquiries_reseller_created
  ON shared_catalog_inquiries (reseller_user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_shared_catalog_inquiries_catalog
  ON shared_catalog_inquiries (shared_catalog_id);

CREATE INDEX IF NOT EXISTS idx_shared_catalogs_expires_at
  ON shared_catalogs (expires_at);
