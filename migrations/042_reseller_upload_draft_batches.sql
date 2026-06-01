-- ============================================
-- Migration 042: Draft Excel batches before admin review
-- ============================================
-- Bulk Excel → submission_status = 'draft' until reseller submits batch for review.
-- ============================================

ALTER TABLE reseller_product_submissions DROP CONSTRAINT IF EXISTS reseller_product_submissions_submission_status_check;

ALTER TABLE reseller_product_submissions ADD CONSTRAINT reseller_product_submissions_submission_status_check
    CHECK (submission_status IN ('draft', 'pending', 'approved', 'rejected', 'withdrawn'));

ALTER TABLE reseller_product_submissions ADD COLUMN IF NOT EXISTS batch_submitted_at TIMESTAMPTZ;
ALTER TABLE reseller_product_submissions ADD COLUMN IF NOT EXISTS batch_label VARCHAR(255);

CREATE INDEX IF NOT EXISTS idx_reseller_product_submissions_batch_submitted
    ON reseller_product_submissions (batch_id, batch_submitted_at)
    WHERE batch_id IS NOT NULL;

DO $$
BEGIN
    RAISE NOTICE '✅ Migration 042 completed: draft status + batch_submitted_at';
END $$;
