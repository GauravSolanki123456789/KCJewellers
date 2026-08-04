-- Migration 088: Fast sync generation by default; economy batch is opt-in

ALTER TABLE users
    ALTER COLUMN reseller_enhanced_gemini_batch_enabled SET DEFAULT false;

DO $$
BEGIN
    RAISE NOTICE '✅ Migration 088 completed: fast sync default for enhanced pictures';
END $$;
