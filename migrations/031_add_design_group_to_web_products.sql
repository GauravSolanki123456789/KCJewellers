-- Migration 031: Add optional design_group for 3-level catalog filtering
-- Keeps existing flow unchanged when design_group is null

ALTER TABLE web_products
    ADD COLUMN IF NOT EXISTS design_group VARCHAR(255);

CREATE INDEX IF NOT EXISTS idx_web_products_design_group
    ON web_products(design_group);
