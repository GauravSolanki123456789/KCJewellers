-- DigiGold & DigiSilver PWA: SIP enrollments, redemptions, making-charge rules
-- Admin toggle remains users.reseller_digigold_enabled + reseller_digisilver_enabled
-- (kept in sync as one module).

ALTER TABLE reseller_digi_schemes
    ADD COLUMN IF NOT EXISTS terms_and_conditions TEXT;

ALTER TABLE reseller_digi_orders
    ADD COLUMN IF NOT EXISTS enrollment_id INTEGER;

CREATE TABLE IF NOT EXISTS reseller_digi_settings (
    reseller_user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    standard_discount_per_gram NUMERIC(12, 2) NOT NULL DEFAULT 4,
    standard_making_charge_pct NUMERIC(8, 4) NOT NULL DEFAULT 0,
    exception_making_charge_pct NUMERIC(8, 4) NOT NULL DEFAULT 50,
    exception_weight_under_grams NUMERIC(12, 3) NOT NULL DEFAULT 25,
    raw_metal_wastage_pct NUMERIC(8, 4) NOT NULL DEFAULT 0,
    shipping_charge_inr NUMERIC(12, 2) NOT NULL DEFAULT 0,
    support_whatsapp VARCHAR(32),
    terms_and_conditions TEXT,
    gst_note VARCHAR(120) NOT NULL DEFAULT '+ 3% GST applicable',
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS reseller_digi_enrollments (
    id SERIAL PRIMARY KEY,
    reseller_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    customer_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    scheme_id INTEGER NOT NULL REFERENCES reseller_digi_schemes(id) ON DELETE RESTRICT,
    metal_key VARCHAR(24) NOT NULL,
    installment_inr NUMERIC(12, 2) NOT NULL,
    duration_months INTEGER NOT NULL,
    bonus_months INTEGER NOT NULL DEFAULT 0,
    months_paid INTEGER NOT NULL DEFAULT 0,
    bonus_grams NUMERIC(14, 6) NOT NULL DEFAULT 0,
    bonus_credited BOOLEAN NOT NULL DEFAULT false,
    status VARCHAR(20) NOT NULL DEFAULT 'active',
    started_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_paid_at TIMESTAMP,
    matured_at TIMESTAMP,
    closed_at TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_digi_enroll_active
    ON reseller_digi_enrollments (reseller_user_id, customer_user_id, scheme_id)
    WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_digi_enroll_reseller
    ON reseller_digi_enrollments (reseller_user_id, status, last_paid_at DESC);

CREATE TABLE IF NOT EXISTS reseller_digi_redemptions (
    id SERIAL PRIMARY KEY,
    reseller_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    customer_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    metal_key VARCHAR(24) NOT NULL,
    grams NUMERIC(14, 6) NOT NULL,
    item_kind VARCHAR(32) NOT NULL,
    making_charge_pct NUMERIC(8, 4) NOT NULL DEFAULT 0,
    discount_per_gram NUMERIC(12, 2) NOT NULL DEFAULT 0,
    wastage_pct NUMERIC(8, 4) NOT NULL DEFAULT 0,
    shipping_inr NUMERIC(12, 2) NOT NULL DEFAULT 0,
    doorstep BOOLEAN NOT NULL DEFAULT false,
    retail_rate_per_gram NUMERIC(12, 2) NOT NULL DEFAULT 0,
    notes TEXT,
    status VARCHAR(20) NOT NULL DEFAULT 'requested',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_digi_redeem_reseller
    ON reseller_digi_redemptions (reseller_user_id, status, created_at DESC);

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'reseller_digi_orders_enrollment_fk'
    ) THEN
        ALTER TABLE reseller_digi_orders
            ADD CONSTRAINT reseller_digi_orders_enrollment_fk
            FOREIGN KEY (enrollment_id) REFERENCES reseller_digi_enrollments(id) ON DELETE SET NULL;
    END IF;
END $$;

DO $$
BEGIN
    RAISE NOTICE '✅ Migration 110 completed: DigiGold/DigiSilver enrollments, redemptions, rules';
END $$;
