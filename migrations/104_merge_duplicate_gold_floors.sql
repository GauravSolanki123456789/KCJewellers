-- One-time fix: merge duplicate floors (Gold vs GOLD) and normalize metal_type.
-- Run on production: sudo -u postgres psql -d kcjewellers -f migrations/104_merge_duplicate_gold_floors.sql
-- Or paste into psql after reviewing the SELECT below.

-- 1) Inspect duplicate floors (same name, different case)
SELECT f.id, f.reseller_user_id, f.name, f.code,
       (SELECT count(*)::int FROM reseller_erp_stock_pieces p
        WHERE p.floor_id = f.id AND p.status = 'in_stock') AS in_stock_pieces
FROM reseller_erp_floors f
WHERE lower(trim(f.name)) = 'gold'
ORDER BY f.name;

-- 2) Merge: keep ALL-CAPS GOLD, move pieces/boxes from Gold → GOLD, delete duplicate
BEGIN;

DO $$
DECLARE
    keep_id UUID;
    drop_id UUID;
    r_uid INTEGER;
BEGIN
    FOR r_uid IN
        SELECT DISTINCT reseller_user_id FROM reseller_erp_floors WHERE lower(trim(name)) = 'gold'
    LOOP
        SELECT id INTO keep_id
        FROM reseller_erp_floors
        WHERE reseller_user_id = r_uid AND lower(trim(name)) = 'gold'
        ORDER BY CASE WHEN trim(name) = upper(trim(name)) THEN 0 ELSE 1 END, created_at ASC
        LIMIT 1;

        FOR drop_id IN
            SELECT id FROM reseller_erp_floors
            WHERE reseller_user_id = r_uid AND lower(trim(name)) = 'gold' AND id <> keep_id
        LOOP
            UPDATE reseller_erp_stock_pieces
            SET floor_id = keep_id, updated_at = NOW()
            WHERE floor_id = drop_id;

            UPDATE reseller_erp_boxes
            SET floor_id = keep_id, updated_at = NOW()
            WHERE floor_id = drop_id;

            DELETE FROM reseller_erp_floors WHERE id = drop_id;
        END LOOP;

        UPDATE reseller_erp_floors
        SET name = 'GOLD', code = upper(trim(code)), updated_at = NOW()
        WHERE id = keep_id;
    END LOOP;
END $$;

-- 3) Uppercase metal_type so Posh does not split Gold vs GOLD categories
UPDATE reseller_erp_stock_pieces
SET metal_type = upper(trim(metal_type)), updated_at = NOW()
WHERE metal_type IS NOT NULL
  AND metal_type IS DISTINCT FROM upper(trim(metal_type));

COMMIT;

-- 4) Verify: one GOLD floor, 88 RFID-tagged in-stock pieces (adjust store as needed)
SELECT f.name, count(p.id)::int AS rfid_in_stock
FROM reseller_erp_floors f
LEFT JOIN reseller_erp_stock_pieces p
  ON p.floor_id = f.id AND p.status = 'in_stock' AND p.rfid_tag IS NOT NULL
WHERE lower(trim(f.name)) = 'gold'
GROUP BY f.name;
