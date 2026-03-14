-- Migration 018: Add discount_percentage to web_products
-- Gaurav Softwares - Jewelry Estimation
-- Run: npm run migrate

ALTER TABLE web_products ADD COLUMN IF NOT EXISTS discount_percentage NUMERIC(5,2) DEFAULT 0;
