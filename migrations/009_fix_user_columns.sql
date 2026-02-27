-- ============================================
-- Migration 009: Fix User Columns - VARCHAR Length
-- Gaurav Softwares - Jewelry Estimation
-- ============================================
-- Fixes: "value too long for type character varying(10)" during Google OAuth
-- Alters all VARCHAR columns in users table with length < 255 to VARCHAR(255)
-- ============================================

-- Alter known columns that may have restrictive lengths
DO $$
DECLARE
    col RECORD;
BEGIN
    FOR col IN 
        SELECT column_name, character_maximum_length
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'users'
          AND data_type = 'character varying'
          AND (character_maximum_length IS NULL OR character_maximum_length < 255)
    LOOP
        EXECUTE format(
            'ALTER TABLE users ALTER COLUMN %I TYPE VARCHAR(255)',
            col.column_name
        );
        RAISE NOTICE 'Altered users.% to VARCHAR(255)', col.column_name;
    END LOOP;
END $$;

-- Explicit ALTER for known columns (in case they weren't caught by the loop)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'name') THEN
        ALTER TABLE users ALTER COLUMN name TYPE VARCHAR(255);
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'role') THEN
        ALTER TABLE users ALTER COLUMN role TYPE VARCHAR(255);
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'account_status') THEN
        ALTER TABLE users ALTER COLUMN account_status TYPE VARCHAR(255);
    END IF;
END $$;

-- Optional: first_name, last_name, status if they exist (some schemas use these)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'first_name') THEN
        ALTER TABLE users ALTER COLUMN first_name TYPE VARCHAR(255);
        RAISE NOTICE 'Altered users.first_name to VARCHAR(255)';
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'last_name') THEN
        ALTER TABLE users ALTER COLUMN last_name TYPE VARCHAR(255);
        RAISE NOTICE 'Altered users.last_name to VARCHAR(255)';
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'status') THEN
        ALTER TABLE users ALTER COLUMN status TYPE VARCHAR(255);
        RAISE NOTICE 'Altered users.status to VARCHAR(255)';
    END IF;
END $$;

-- ============================================
-- VERIFY
-- ============================================
DO $$ 
BEGIN
    RAISE NOTICE '✅ Migration 009 completed: User VARCHAR columns expanded to 255';
END $$;
