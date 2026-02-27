-- ============================================
-- Migration 012: Catalog Publish Control
-- ============================================
-- Add is_published to web_categories for admin visibility control
-- ============================================

ALTER TABLE web_categories ADD COLUMN IF NOT EXISTS is_published BOOLEAN DEFAULT false;
