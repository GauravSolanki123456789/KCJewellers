-- Optional secondary product photo (ERP: secondary_image_url / JSON secondaryImageUrl + hasSecondaryImage).

ALTER TABLE web_products
  ADD COLUMN IF NOT EXISTS secondary_image_url TEXT;

COMMENT ON COLUMN web_products.secondary_image_url IS 'HTTPS URL or app path for second product angle (e.g. {barcode}_secondary.webp)';
