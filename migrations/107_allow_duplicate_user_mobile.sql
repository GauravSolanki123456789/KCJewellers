-- Reseller WhatsApp / orders mobile may repeat across B2B accounts (not used as global login key).

ALTER TABLE users DROP CONSTRAINT IF EXISTS users_mobile_number_key;
DROP INDEX IF EXISTS idx_users_mobile_number_unique;

CREATE INDEX IF NOT EXISTS idx_users_mobile_number ON users(mobile_number) WHERE mobile_number IS NOT NULL;

DO $$ BEGIN
    RAISE NOTICE '✅ Migration 107: dropped unique constraint on users.mobile_number';
END $$;
