-- Fix product/category image URLs still pointing at the old API host after domain migration.
-- Run on the production DB, e.g.:
--   sudo -u postgres psql -d kcjewellers -f scripts/sql/update_legacy_api_image_hosts.sql
-- Or paste into psql. Adjust the replacement URL if your API differs.

BEGIN;

-- Preview (optional — run alone first to see counts)
-- SELECT COUNT(*) FROM web_products WHERE image_url ~* 'gauravsoftwares\.tech';
-- SELECT COUNT(*) FROM web_products WHERE certificate_url ~* 'gauravsoftwares\.tech';
-- SELECT COUNT(*) FROM web_categories WHERE image_url ~* 'gauravsoftwares\.tech';

UPDATE web_products
SET image_url = regexp_replace(
  image_url,
  '^https?://api\.kc\.gauravsoftwares\.tech',
  'https://api.kcjewellers.co.in',
  'i'
)
WHERE image_url IS NOT NULL
  AND image_url ~* 'api\.kc\.gauravsoftwares\.tech';

UPDATE web_products
SET certificate_url = regexp_replace(
  certificate_url,
  '^https?://api\.kc\.gauravsoftwares\.tech',
  'https://api.kcjewellers.co.in',
  'i'
)
WHERE certificate_url IS NOT NULL
  AND certificate_url ~* 'api\.kc\.gauravsoftwares\.tech';

UPDATE web_categories
SET image_url = regexp_replace(
  image_url,
  '^https?://api\.kc\.gauravsoftwares\.tech',
  'https://api.kcjewellers.co.in',
  'i'
)
WHERE image_url IS NOT NULL
  AND image_url ~* 'api\.kc\.gauravsoftwares\.tech';

COMMIT;
