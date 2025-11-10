-- Dateien (PDF/Bild) + Rohdaten
CREATE TABLE IF NOT EXISTS uploaded_files (
  id BIGSERIAL PRIMARY KEY,
  original_filename TEXT,
  mime_type TEXT,
  byte_size INTEGER,
  file_bytes BYTEA,
  storage_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Falls ältere Versionen existieren: fehlende Spalten ergänzen
ALTER TABLE uploaded_files ADD COLUMN IF NOT EXISTS file_sha256 TEXT;
ALTER TABLE uploaded_files ADD COLUMN IF NOT EXISTS original_filename TEXT;
ALTER TABLE uploaded_files ADD COLUMN IF NOT EXISTS mime_type TEXT;
ALTER TABLE uploaded_files ADD COLUMN IF NOT EXISTS byte_size INTEGER;
ALTER TABLE uploaded_files ADD COLUMN IF NOT EXISTS file_bytes BYTEA;
ALTER TABLE uploaded_files ADD COLUMN IF NOT EXISTS storage_url TEXT;
ALTER TABLE uploaded_files ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- Eindeutiger Fingerprint
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='uploaded_files' AND column_name='file_sha256'
  ) THEN
    CREATE UNIQUE INDEX IF NOT EXISTS idx_uploaded_files_sha256
      ON uploaded_files (file_sha256);
  END IF;
END$$;

-- Belegdokument mit Normalisierung
CREATE TABLE IF NOT EXISTS documents (
  id BIGSERIAL PRIMARY KEY,
  file_id BIGINT REFERENCES uploaded_files(id) ON DELETE CASCADE,
  doc_kind TEXT,                         -- invoice | receipt | xrechnung | zugferd | layout | read
  source_model TEXT,                     -- azure:prebuilt-invoice etc.
  model_confidence NUMERIC,
  raw_json JSONB NOT NULL,               -- Rohantwort Modell/Parser
  normalized JSONB,                      -- normalisierte Felder als JSON

  -- Flattened Kernfelder
  chart_of_accounts TEXT DEFAULT 'SKR03',
  creditor_name TEXT,
  debtor_name TEXT,
  creditor_tax_id TEXT,
  debtor_tax_id TEXT,
  invoice_number TEXT,
  invoice_date DATE,
  currency TEXT,
  subtotal NUMERIC,
  tax_amount NUMERIC,
  tax_rate NUMERIC,
  total_amount NUMERIC,
  iban TEXT,
  bic TEXT,
  vat_country_code TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Zeilen (optional)
CREATE TABLE IF NOT EXISTS document_lines (
  id BIGSERIAL PRIMARY KEY,
  document_id BIGINT REFERENCES documents(id) ON DELETE CASCADE,
  line_no INTEGER,
  description TEXT,
  quantity NUMERIC,
  unit_price NUMERIC,
  net_amount NUMERIC,
  tax_rate NUMERIC,
  tax_amount NUMERIC,
  account_code TEXT,
  vat_code TEXT
);

CREATE INDEX IF NOT EXISTS idx_documents_file_id ON documents(file_id);
CREATE INDEX IF NOT EXISTS idx_documents_raw_json ON documents USING GIN (raw_json);
CREATE INDEX IF NOT EXISTS idx_documents_normalized ON documents USING GIN (normalized);
