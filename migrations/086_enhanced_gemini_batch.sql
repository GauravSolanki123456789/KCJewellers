-- Migration 086: Async Gemini Batch API jobs for enhanced pictures (50% cost, higher limits)

ALTER TABLE users
    ADD COLUMN IF NOT EXISTS reseller_enhanced_gemini_batch_enabled BOOLEAN NOT NULL DEFAULT true;

COMMENT ON COLUMN users.reseller_enhanced_gemini_batch_enabled IS
    'When true, reseller studio uses Gemini Batch API (async, ~50% cost). Admin Prompt Lab tests stay synchronous.';

ALTER TABLE reseller_enhanced_picture_jobs
    ADD COLUMN IF NOT EXISTS generation_mode VARCHAR(16) NOT NULL DEFAULT 'sync',
    ADD COLUMN IF NOT EXISTS gemini_batch_name TEXT,
    ADD COLUMN IF NOT EXISTS batch_state VARCHAR(64),
    ADD COLUMN IF NOT EXISTS batch_submitted_at TIMESTAMP,
    ADD COLUMN IF NOT EXISTS batch_completed_at TIMESTAMP,
    ADD COLUMN IF NOT EXISTS credit_charged BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_enhanced_jobs_batch_pending
    ON reseller_enhanced_picture_jobs (status, batch_submitted_at)
    WHERE gemini_batch_name IS NOT NULL AND status IN ('batch_queued', 'batch_processing');

DO $$
BEGIN
    RAISE NOTICE '✅ Migration 086 completed: Gemini batch async enhanced picture jobs';
END $$;
