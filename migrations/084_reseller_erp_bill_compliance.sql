-- E-invoice / e-way compliance metadata on ERP sales bills
ALTER TABLE reseller_erp_bills
    ADD COLUMN IF NOT EXISTS compliance_json JSONB DEFAULT NULL;
