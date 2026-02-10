-- ============================================
-- Migration 002: Granular User Permissions
-- Gaurav Softwares - Jewelry Estimation
-- ============================================
-- Run: psql -U postgres -d jewelry_db -f migrations/002_user_permissions.sql
-- ============================================

-- ============================================
-- ADD PERMISSIONS COLUMN TO USERS TABLE
-- Using JSONB for flexible permission storage
-- ============================================

-- Add permissions column if it doesn't exist
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'users' AND column_name = 'permissions'
    ) THEN
        ALTER TABLE users ADD COLUMN permissions JSONB DEFAULT '{}';
    END IF;
END $$;

-- ============================================
-- UPDATE EXISTING USERS WITH DEFAULT PERMISSIONS
-- ============================================

-- Super Admin: Full access (permissions = { all: true })
UPDATE users 
SET permissions = '{"all": true, "modules": ["*"]}'::jsonb,
    allowed_tabs = ARRAY['all']
WHERE email = 'jaigaurav56789@gmail.com';

-- Admin users: Full access
UPDATE users 
SET permissions = COALESCE(permissions, '{}'::jsonb) || '{"all": true, "modules": ["*"]}'::jsonb,
    allowed_tabs = COALESCE(allowed_tabs, ARRAY['all'])
WHERE role = 'admin' 
AND email != 'jaigaurav56789@gmail.com'
AND (permissions IS NULL OR permissions = '{}'::jsonb);

-- Employee users: Default to billing only (if no permissions set)
UPDATE users 
SET permissions = '{"all": false, "modules": ["billing"]}'::jsonb,
    allowed_tabs = ARRAY['billing']
WHERE role = 'employee'
AND (allowed_tabs IS NULL OR allowed_tabs = '{}' OR array_length(allowed_tabs, 1) IS NULL);

-- ============================================
-- CREATE INDEX FOR PERFORMANCE
-- ============================================
CREATE INDEX IF NOT EXISTS idx_users_permissions ON users USING gin(permissions);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_users_account_status ON users(account_status);

-- ============================================
-- VERIFY MIGRATION
-- ============================================
DO $$ 
BEGIN
    RAISE NOTICE '✅ Migration 002 completed: User permissions column added';
    RAISE NOTICE 'Super Admin: Full access granted';
    RAISE NOTICE 'Employees: Default billing access set';
END $$;

-- ============================================
-- PERMISSION MODULES REFERENCE
-- ============================================
-- Available modules for allowed_tabs / permissions.modules:
-- - 'all' or '*' = Full access to everything
-- - 'billing' = Billing tab
-- - 'products' = Products & Stock tab
-- - 'customers' = CRM / Customers tab
-- - 'rol' = ROL Management tab
-- - 'quotations' = Quotations tab
-- - 'salesbill' = Sales Bill tab  
-- - 'salesreturn' = Sales Return tab
-- - 'billhistory' = Bill History tab
-- - 'ledger' = Ledger tab
-- - 'styles' = Style Master tab
-- - 'pv' = Purchase Voucher / Stock-In tab
-- - 'tagsplit' = Tag Split/Merge tab
-- - 'tagsearch' = Tag Search tab
-- - 'floor' = Floor Management tab
-- - 'reports' = Reports tab
-- ============================================
