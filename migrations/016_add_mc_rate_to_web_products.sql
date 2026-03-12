-- ============================================
-- Migration 016: Add mc_rate to web_products
-- Gaurav Softwares - Jewelry Estimation
-- ============================================
-- Run: npm run migrate
-- ============================================

ALTER TABLE web_products ADD COLUMN IF NOT EXISTS mc_rate NUMERIC(12,2);
