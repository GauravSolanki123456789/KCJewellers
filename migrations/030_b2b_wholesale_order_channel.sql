-- B2B wholesale purchase orders: channel + checkout type + wider payment_status for PENDING_APPROVAL
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'orders' AND column_name = 'order_channel'
    ) THEN
        ALTER TABLE orders ADD COLUMN order_channel VARCHAR(32) NOT NULL DEFAULT 'RETAIL';
        ALTER TABLE orders ADD CONSTRAINT orders_order_channel_check
            CHECK (order_channel IN ('RETAIL', 'B2B_WHOLESALE'));
        RAISE NOTICE 'Added orders.order_channel';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'orders' AND column_name = 'b2b_checkout_type'
    ) THEN
        ALTER TABLE orders ADD COLUMN b2b_checkout_type VARCHAR(16);
        ALTER TABLE orders ADD CONSTRAINT orders_b2b_checkout_type_check
            CHECK (b2b_checkout_type IS NULL OR b2b_checkout_type IN ('NEFT', 'LEDGER'));
        RAISE NOTICE 'Added orders.b2b_checkout_type';
    END IF;

    -- Older local DBs may miss payment_status entirely
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'orders' AND column_name = 'payment_status'
    ) THEN
        ALTER TABLE orders ADD COLUMN payment_status VARCHAR(40) DEFAULT 'PENDING';
        RAISE NOTICE 'Added orders.payment_status';
    END IF;

    -- PENDING_APPROVAL is 17 chars — ensure column is wide enough
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'orders' AND column_name = 'payment_status'
          AND character_maximum_length IS NOT NULL AND character_maximum_length < 32
    ) THEN
        ALTER TABLE orders ALTER COLUMN payment_status TYPE VARCHAR(40);
        RAISE NOTICE 'Widened orders.payment_status';
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_orders_b2b_pending
    ON orders (order_channel, payment_status)
    WHERE order_channel = 'B2B_WHOLESALE' AND payment_status = 'PENDING_APPROVAL';
