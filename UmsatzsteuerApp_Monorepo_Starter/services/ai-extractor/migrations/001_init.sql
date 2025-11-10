-- services/ai-extractor/migrations/001_init.sql

-- UUIDs
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS receipts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  file_name TEXT,
  mime_type TEXT,
  file_sha256 TEXT,

  model TEXT,
  score NUMERIC,
  source TEXT,

  xml_type TEXT,
  xml_version TEXT,

  currency TEXT,
  subtotal NUMERIC,
  tax NUMERIC,
  total NUMERIC,

  vendor_name TEXT,
  vendor_vat_id TEXT,
  buyer_name TEXT,
  buyer_vat_id TEXT,

  creditor_name TEXT,
  debtor_name TEXT,

  invoice_number TEXT,
  invoice_date DATE,
  due_date DATE,

  iban TEXT,
  bic TEXT,

  chart_of_accounts TEXT,

  tax_rate_guess NUMERIC,

  mapped_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  raw_json JSONB NOT NULL DEFAULT '{}'::jsonb,

  file_bytes BYTEA
);

CREATE INDEX IF NOT EXISTS idx_receipts_created_at ON receipts(created_at);
CREATE INDEX IF NOT EXISTS idx_receipts_sha256 ON receipts(file_sha256);
CREATE INDEX IF NOT EXISTS idx_receipts_invoice_number ON receipts(invoice_number);
CREATE INDEX IF NOT EXISTS idx_receipts_vendor ON receipts(vendor_name);
CREATE INDEX IF NOT EXISTS idx_receipts_buyer ON receipts(buyer_name);

CREATE TABLE IF NOT EXISTS receipt_items (
  id BIGSERIAL PRIMARY KEY,
  receipt_id UUID NOT NULL REFERENCES receipts(id) ON DELETE CASCADE,
  position_no INT,
  description TEXT,
  quantity NUMERIC,
  unit_price NUMERIC,
  amount_net NUMERIC,
  tax_rate NUMERIC
);

CREATE INDEX IF NOT EXISTS idx_receipt_items_receipt ON receipt_items(receipt_id);
