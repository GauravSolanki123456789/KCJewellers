-- Per-metal reseller catalogue scope (e.g. Chain Pendant Gold ≠ Chain Pendant Silver)
ALTER TABLE users
    ADD COLUMN IF NOT EXISTS allowed_category_metals JSONB NOT NULL DEFAULT '{}'::jsonb;

DO $$
BEGIN
    RAISE NOTICE '✅ Migration 052: users.allowed_category_metals for per-metal reseller catalogue scope';
END $$;
