-- Shared catalogue pricing slabs (SLABR / SLABW / SLABF) — per-reseller defaults + per-link snapshot.

ALTER TABLE users ADD COLUMN IF NOT EXISTS reseller_slab_settings JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE shared_catalogs ADD COLUMN IF NOT EXISTS pricing_slab VARCHAR(16) NOT NULL DEFAULT 'standard';
ALTER TABLE shared_catalogs ADD COLUMN IF NOT EXISTS slab_wholesale_gold_rate_per_g NUMERIC(12, 4);
ALTER TABLE shared_catalogs ADD COLUMN IF NOT EXISTS slab_wholesale_silver_rate_per_g NUMERIC(12, 4);
ALTER TABLE shared_catalogs ADD COLUMN IF NOT EXISTS slab_settings_snapshot JSONB;

DO $$
BEGIN
    RAISE NOTICE '✅ Migration 057 completed: shared catalogue slabs (SLABR/SLABW/SLABF)';
END $$;
