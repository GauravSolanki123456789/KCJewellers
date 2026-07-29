-- Per-reseller sequential inquiry numbers (1, 2, 3… per reseller_user_id).

ALTER TABLE shared_catalog_inquiries
    ADD COLUMN IF NOT EXISTS reseller_inquiry_number INTEGER;

WITH numbered AS (
    SELECT
        id,
        ROW_NUMBER() OVER (
            PARTITION BY reseller_user_id
            ORDER BY created_at ASC, id ASC
        ) AS rn
    FROM shared_catalog_inquiries
    WHERE reseller_user_id IS NOT NULL
)
UPDATE shared_catalog_inquiries sci
SET reseller_inquiry_number = numbered.rn
FROM numbered
WHERE sci.id = numbered.id
  AND sci.reseller_inquiry_number IS NULL;

CREATE INDEX IF NOT EXISTS idx_shared_catalog_inquiries_reseller_seq
    ON shared_catalog_inquiries (reseller_user_id, reseller_inquiry_number);
