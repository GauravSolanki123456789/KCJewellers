-- ============================================
-- Snapshot customer contact at checkout (name + WhatsApp/mobile)
-- Run: npm run migrate
-- ============================================

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'checkout_contact_name'
    ) THEN
        ALTER TABLE orders ADD COLUMN checkout_contact_name VARCHAR(255);
        RAISE NOTICE 'Added orders.checkout_contact_name';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'checkout_contact_mobile'
    ) THEN
        ALTER TABLE orders ADD COLUMN checkout_contact_mobile VARCHAR(20);
        RAISE NOTICE 'Added orders.checkout_contact_mobile';
    END IF;
END $$;

DO $$
BEGIN
    RAISE NOTICE '✅ Migration 053 completed: orders checkout contact columns';
END $$;
