-- ============================================
-- Migration 043: Legacy pending Excel bulk → draft
-- ============================================
-- Before the draft-batch workflow, bulk Excel rows went straight to `pending`.
-- Revert those (batch_id set) to `draft` so reseller staff can attach photos,
-- then submit the batch for KC admin review.
-- Single-product submissions (batch_id IS NULL) are unchanged.
-- ============================================

DO $$
DECLARE
    affected INT;
BEGIN
    UPDATE reseller_product_submissions
    SET
        submission_status = 'draft',
        batch_submitted_at = NULL,
        updated_at = CURRENT_TIMESTAMP,
        batch_label = COALESCE(
            NULLIF(TRIM(batch_label), ''),
            'Excel import (legacy — add photos)'
        )
    WHERE submission_status = 'pending'
      AND batch_id IS NOT NULL;

    GET DIAGNOSTICS affected = ROW_COUNT;
    RAISE NOTICE '✅ Migration 043: reverted % pending Excel batch row(s) to draft', affected;
END $$;
