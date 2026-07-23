-- Widen customer_mobile for international E.164 numbers on shared catalogue inquiries.
ALTER TABLE shared_catalog_inquiries
    ALTER COLUMN customer_mobile TYPE VARCHAR(32);
