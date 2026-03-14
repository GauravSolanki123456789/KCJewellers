-- Migration 019: Add discount_percentage to web_categories (Style-level discount)
-- Gaurav Softwares - Jewelry Estimation
-- Run: npm run migrate

ALTER TABLE web_categories ADD COLUMN IF NOT EXISTS discount_percentage NUMERIC(5,2) DEFAULT 0;
