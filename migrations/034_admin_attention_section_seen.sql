-- ============================================
-- Per-admin "read" cursor for dashboard badges (unread since last visit per section)
-- ============================================
-- Run: npm run migrate
-- ============================================

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'admin_attention_section_seen'
    ) THEN
        CREATE TABLE admin_attention_section_seen (
            id              BIGSERIAL PRIMARY KEY,
            user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            attention_section_key VARCHAR(64) NOT NULL,
            last_seen_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            UNIQUE (user_id, attention_section_key)
        );
        CREATE INDEX IF NOT EXISTS idx_admin_attention_seen_user
            ON admin_attention_section_seen(user_id);
        RAISE NOTICE 'Created admin_attention_section_seen';
    END IF;
END $$;

-- Touch time for orders (badges reflect status changes after admin last opened Orders)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'updated_at'
    ) THEN
        ALTER TABLE orders ADD COLUMN updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP;
        UPDATE orders SET updated_at = COALESCE(created_at::timestamptz, CURRENT_TIMESTAMP) WHERE updated_at IS NULL;
        RAISE NOTICE 'Added orders.updated_at';
    END IF;
END $$;

DO $$
BEGIN
    RAISE NOTICE '✅ Migration 034 completed: admin_attention_section_seen + orders.updated_at';
END $$;
