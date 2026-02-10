-- ============================================
-- Enterprise Upgrade Migration v2.2.0
-- Gaurav Softwares - Jewelry Estimation
-- ============================================
-- Run: npm run migrate
-- ============================================

-- ============================================
-- PHASE 1A: STYLES TABLE (Style Master)
-- ============================================
CREATE TABLE IF NOT EXISTS styles (
    id SERIAL PRIMARY KEY,
    style_code VARCHAR(50) UNIQUE NOT NULL,
    item_name VARCHAR(255) NOT NULL,
    category VARCHAR(100),
    metal_type VARCHAR(50) DEFAULT 'gold',
    default_purity DECIMAL(5,2) DEFAULT 91.6,
    default_mc_type VARCHAR(20) DEFAULT 'PER_GRAM',
    default_mc_value DECIMAL(10,2) DEFAULT 0,
    hsn_code VARCHAR(20) DEFAULT '7113',
    min_weight DECIMAL(10,3),
    max_weight DECIMAL(10,3),
    description TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_styles_code ON styles(style_code);
CREATE INDEX IF NOT EXISTS idx_styles_category ON styles(category);
CREATE INDEX IF NOT EXISTS idx_styles_active ON styles(is_active);

-- ============================================
-- PHASE 1B: UPDATE PRODUCTS TABLE
-- ============================================

-- Tag Number (unique physical identifier)
ALTER TABLE products ADD COLUMN IF NOT EXISTS tag_no VARCHAR(50);
CREATE UNIQUE INDEX IF NOT EXISTS idx_products_tag_no ON products(tag_no) WHERE tag_no IS NOT NULL;

-- ROL Limit (Re-Order Level)
ALTER TABLE products ADD COLUMN IF NOT EXISTS rol_limit INTEGER DEFAULT 0;

-- Bin Location (warehouse location)
ALTER TABLE products ADD COLUMN IF NOT EXISTS bin_location VARCHAR(50);

-- Vendor Code (supplier reference)
ALTER TABLE products ADD COLUMN IF NOT EXISTS vendor_code VARCHAR(50);

-- Gross Weight (total weight before deductions)
ALTER TABLE products ADD COLUMN IF NOT EXISTS gross_wt DECIMAL(10,3);

-- Net Weight (after stone/beads deduction)
ALTER TABLE products ADD COLUMN IF NOT EXISTS net_wt DECIMAL(10,3);

-- Purchase Cost (supplier cost price)
ALTER TABLE products ADD COLUMN IF NOT EXISTS purchase_cost DECIMAL(12,2);

-- Purchase Voucher reference
ALTER TABLE products ADD COLUMN IF NOT EXISTS pv_id INTEGER;

-- Tag status for split/merge tracking
ALTER TABLE products ADD COLUMN IF NOT EXISTS tag_status VARCHAR(20) DEFAULT 'active';

-- Split tracking columns
ALTER TABLE products ADD COLUMN IF NOT EXISTS split_from_tag VARCHAR(50);
ALTER TABLE products ADD COLUMN IF NOT EXISTS merged_into_tag VARCHAR(50);

-- ============================================
-- PHASE 1C: UPDATE BILLS TABLE (Tax Split)
-- ============================================

-- Taxable Value (amount before tax)
ALTER TABLE bills ADD COLUMN IF NOT EXISTS taxable_value DECIMAL(12,2);

-- Round Off adjustment
ALTER TABLE bills ADD COLUMN IF NOT EXISTS round_off DECIMAL(10,2) DEFAULT 0;

-- GST Rate slab
ALTER TABLE bills ADD COLUMN IF NOT EXISTS gst_rate VARCHAR(10) DEFAULT '3';

-- Discount amount
ALTER TABLE bills ADD COLUMN IF NOT EXISTS discount_amount DECIMAL(10,2) DEFAULT 0;

-- Old Gold/Silver exchange
ALTER TABLE bills ADD COLUMN IF NOT EXISTS old_gold_wt DECIMAL(10,3) DEFAULT 0;
ALTER TABLE bills ADD COLUMN IF NOT EXISTS old_gold_value DECIMAL(12,2) DEFAULT 0;

-- ============================================
-- PHASE 1D: CREATE BILL_ITEMS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS bill_items (
    id SERIAL PRIMARY KEY,
    bill_id INTEGER REFERENCES bills(id) ON DELETE CASCADE,
    product_id INTEGER REFERENCES products(id),
    barcode VARCHAR(100),
    tag_no VARCHAR(50),
    item_name VARCHAR(255),
    metal_type VARCHAR(50),
    gross_wt DECIMAL(10,3),
    net_wt DECIMAL(10,3),
    purity DECIMAL(5,2),
    rate DECIMAL(12,2),
    mc_type VARCHAR(20),
    mc_value DECIMAL(10,2),
    mc_amount DECIMAL(12,2),
    stone_charges DECIMAL(10,2) DEFAULT 0,
    other_charges DECIMAL(10,2) DEFAULT 0,
    taxable_value DECIMAL(12,2),
    cgst_rate DECIMAL(5,2) DEFAULT 1.5,
    cgst_amount DECIMAL(10,2),
    sgst_rate DECIMAL(5,2) DEFAULT 1.5,
    sgst_amount DECIMAL(10,2),
    total_amount DECIMAL(12,2),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_bill_items_bill ON bill_items(bill_id);
CREATE INDEX IF NOT EXISTS idx_bill_items_product ON bill_items(product_id);

-- ============================================
-- PHASE 1E: PURCHASE VOUCHERS ENHANCEMENT
-- ============================================

-- Add columns if purchase_vouchers exists
ALTER TABLE purchase_vouchers ADD COLUMN IF NOT EXISTS vendor_code VARCHAR(50);
ALTER TABLE purchase_vouchers ADD COLUMN IF NOT EXISTS vendor_bill_no VARCHAR(100);
ALTER TABLE purchase_vouchers ADD COLUMN IF NOT EXISTS vendor_bill_date DATE;
ALTER TABLE purchase_vouchers ADD COLUMN IF NOT EXISTS total_gross_wt DECIMAL(12,3);
ALTER TABLE purchase_vouchers ADD COLUMN IF NOT EXISTS total_net_wt DECIMAL(12,3);
ALTER TABLE purchase_vouchers ADD COLUMN IF NOT EXISTS total_pcs INTEGER DEFAULT 0;
ALTER TABLE purchase_vouchers ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'draft';

-- ============================================
-- PHASE 1F: TAG OPERATIONS LOG TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS tag_operations (
    id SERIAL PRIMARY KEY,
    operation_type VARCHAR(20) NOT NULL, -- 'SPLIT', 'MERGE'
    source_tags TEXT[], -- Array of source tag numbers
    result_tags TEXT[], -- Array of resulting tag numbers
    source_total_wt DECIMAL(10,3),
    result_total_wt DECIMAL(10,3),
    notes TEXT,
    performed_by VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_tag_ops_type ON tag_operations(operation_type);
CREATE INDEX IF NOT EXISTS idx_tag_ops_date ON tag_operations(created_at);

-- ============================================
-- PHASE 1G: VENDORS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS vendors (
    id SERIAL PRIMARY KEY,
    vendor_code VARCHAR(50) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    contact_person VARCHAR(255),
    mobile VARCHAR(20),
    email VARCHAR(255),
    address TEXT,
    city VARCHAR(100),
    state VARCHAR(100),
    pincode VARCHAR(10),
    gstin VARCHAR(20),
    pan VARCHAR(20),
    bank_name VARCHAR(255),
    bank_account VARCHAR(50),
    ifsc VARCHAR(20),
    credit_days INTEGER DEFAULT 0,
    credit_limit DECIMAL(12,2) DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_vendors_code ON vendors(vendor_code);
CREATE INDEX IF NOT EXISTS idx_vendors_name ON vendors(name);

-- ============================================
-- SEED DATA: Sample Styles
-- ============================================
INSERT INTO styles (style_code, item_name, category, metal_type, default_purity, default_mc_type, default_mc_value, description) 
SELECT 'RING-001', 'Gold Ring Plain', 'Rings', 'gold', 91.6, 'PER_GRAM', 350, 'Plain gold ring design'
WHERE NOT EXISTS (SELECT 1 FROM styles WHERE style_code = 'RING-001');

INSERT INTO styles (style_code, item_name, category, metal_type, default_purity, default_mc_type, default_mc_value, description) 
SELECT 'CHAIN-001', 'Gold Chain Hollow', 'Chains', 'gold', 91.6, 'PER_GRAM', 280, 'Hollow rope chain design'
WHERE NOT EXISTS (SELECT 1 FROM styles WHERE style_code = 'CHAIN-001');

INSERT INTO styles (style_code, item_name, category, metal_type, default_purity, default_mc_type, default_mc_value, description) 
SELECT 'BANG-001', 'Gold Bangle Plain', 'Bangles', 'gold', 91.6, 'FIXED', 1500, 'Plain bangle set'
WHERE NOT EXISTS (SELECT 1 FROM styles WHERE style_code = 'BANG-001');

INSERT INTO styles (style_code, item_name, category, metal_type, default_purity, default_mc_type, default_mc_value, description) 
SELECT 'EAR-001', 'Gold Earrings Jhumka', 'Earrings', 'gold', 91.6, 'FIXED', 800, 'Traditional jhumka earrings'
WHERE NOT EXISTS (SELECT 1 FROM styles WHERE style_code = 'EAR-001');

INSERT INTO styles (style_code, item_name, category, metal_type, default_purity, default_mc_type, default_mc_value, description) 
SELECT 'NECK-001', 'Gold Necklace Set', 'Necklaces', 'gold', 91.6, 'PER_GRAM', 450, 'Designer necklace with pendant'
WHERE NOT EXISTS (SELECT 1 FROM styles WHERE style_code = 'NECK-001');

-- ============================================
-- MIGRATE EXISTING DATA
-- ============================================

-- Set gross_wt = weight where null
UPDATE products SET gross_wt = weight WHERE gross_wt IS NULL AND weight IS NOT NULL;

-- Set net_wt = weight where null  
UPDATE products SET net_wt = weight WHERE net_wt IS NULL AND weight IS NOT NULL;

-- Set taxable_value = total where null (for existing bills)
UPDATE bills SET taxable_value = total WHERE taxable_value IS NULL AND total IS NOT NULL;

-- Calculate CGST/SGST for existing bills (split 3% into 1.5% each)
UPDATE bills 
SET cgst = ROUND(taxable_value * 0.015, 2),
    sgst = ROUND(taxable_value * 0.015, 2)
WHERE cgst IS NULL OR sgst IS NULL;

-- ============================================
-- COMPLETION
-- ============================================
-- New tables: styles, bill_items, tag_operations, vendors
-- Updated: products (tag_no, rol_limit, bin_location, etc.)
-- Updated: bills (taxable_value, round_off, gst_rate)
-- ============================================
