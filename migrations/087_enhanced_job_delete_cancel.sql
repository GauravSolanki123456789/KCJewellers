-- Migration 087: Soft-delete enhanced picture jobs; support user cancel/stop

ALTER TABLE reseller_enhanced_picture_jobs
    ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP;

CREATE INDEX IF NOT EXISTS idx_enhanced_jobs_user_active
    ON reseller_enhanced_picture_jobs (reseller_user_id, created_at DESC)
    WHERE deleted_at IS NULL;

DO $$
BEGIN
    RAISE NOTICE '✅ Migration 087 completed: enhanced picture job delete/cancel support';
END $$;
