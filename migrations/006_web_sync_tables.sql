-- ============================================
-- Migration 006: Web Sync Tables
-- Gaurav Softwares - Jewelry Estimation
-- ============================================
-- Run: npm run migrate
-- ============================================
-- Creates tables for syncing products from ERP to web store
-- ============================================

-- ============================================
-- WEB_CATEGORIES: Stores 'Style Code' from ERP
-- ============================================
CREATE TABLE IF NOT EXISTS web_categories (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(255) UNIQUE NOT NULL,
    image_url TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_web_categories_slug ON web_categories(slug);
CREATE INDEX IF NOT EXISTS idx_web_categories_name ON web_categories(name);

-- ============================================
-- WEB_SUBCATEGORIES: Stores 'SKU Code' from ERP
-- ============================================
CREATE TABLE IF NOT EXISTS web_subcategories (
    id SERIAL PRIMARY KEY,
    category_id INTEGER NOT NULL REFERENCES web_categories(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(255) UNIQUE NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_web_subcategories_category_id ON web_subcategories(category_id);
CREATE INDEX IF NOT EXISTS idx_web_subcategories_slug ON web_subcategories(slug);
CREATE INDEX IF NOT EXISTS idx_web_subcategories_name ON web_subcategories(name);

-- ============================================
-- WEB_PRODUCTS: The actual synced items
-- ============================================
CREATE TABLE IF NOT EXISTS web_products (
    id SERIAL PRIMARY KEY,
    subcategory_id INTEGER NOT NULL REFERENCES web_subcategories(id) ON DELETE CASCADE,
    sku VARCHAR(255) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    gross_weight NUMERIC(10,3),
    net_weight NUMERIC(10,3),
    purity VARCHAR(50),
    image_url TEXT,
    is_active BOOLEAN DEFAULT true,
    last_synced_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_web_products_sku ON web_products(sku);
CREATE INDEX IF NOT EXISTS idx_web_products_subcategory_id ON web_products(subcategory_id);
CREATE INDEX IF NOT EXISTS idx_web_products_is_active ON web_products(is_active);
CREATE INDEX IF NOT EXISTS idx_web_products_last_synced_at ON web_products(last_synced_at);

-- ============================================
-- Add updated_at trigger function if not exists
-- ============================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Add triggers for updated_at
DROP TRIGGER IF EXISTS update_web_categories_updated_at ON web_categories;
CREATE TRIGGER update_web_categories_updated_at
    BEFORE UPDATE ON web_categories
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_web_subcategories_updated_at ON web_subcategories;
CREATE TRIGGER update_web_subcategories_updated_at
    BEFORE UPDATE ON web_subcategories
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_web_products_updated_at ON web_products;
CREATE TRIGGER update_web_products_updated_at
    BEFORE UPDATE ON web_products
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
