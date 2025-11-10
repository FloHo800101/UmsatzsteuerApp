-- Idempotent: Tabellen nur erstellen, wenn sie noch nicht existieren

create extension if not exists "uuid-ossp";

create table if not exists documents (
  id uuid primary key default uuid_generate_v4(),
  uploaded_at timestamptz not null default now(),

  -- Datei-Metadaten und Datei selbst
  filename text,
  file_mime text,
  file_size bigint,
  file_sha256 text,
  file_bytes bytea, -- Hinweis: Für große Dateien evtl. später in S3/MinIO auslagern

  -- Azure/Modell-Metadaten
  source_model text,            -- z.B. prebuilt-invoice / prebuilt-receipt / layout / read
  model_confidence numeric(5,4),-- eigener zusammengesetzter Score

  -- Dokument-Typ & Partner
  doc_type text,                -- invoice, receipt, ocr
  partner_type text,            -- 'creditor' | 'debtor'
  vendor_name text,
  vendor_tax_id text,
  customer_name text,

  -- Rechnungsdaten
  invoice_number text,
  invoice_date date,
  due_date date,

  -- Beträge & Währung
  currency text,
  subtotal numeric(14,2),
  total_tax numeric(14,2),
  total numeric(14,2),
  net_amount numeric(14,2),
  gross_amount numeric(14,2),
  tax_rate numeric(6,4),        -- z.B. 0.1900

  -- Kontenrahmen
  chart_of_accounts text,       -- z.B. SKR03 / SKR04
  account_number text,          -- Zielkonto (Vorschlag oder final)
  account_name text,
  account_suggestion_confidence numeric(5,4),

  -- Rohdaten
  raw_json jsonb
);

create index if not exists idx_documents_uploaded_at on documents (uploaded_at desc);
create index if not exists idx_documents_doc_type on documents (doc_type);
create index if not exists idx_documents_vendor_name on documents (vendor_name);
create index if not exists idx_documents_invoice_number on documents (invoice_number);

create table if not exists document_items (
  id bigserial primary key,
  document_id uuid not null references documents(id) on delete cascade,
  line_no int,
  description text,
  quantity numeric(14,3),
  unit_price numeric(14,4),
  amount numeric(14,2),
  tax_rate numeric(6,4)
);

create index if not exists idx_items_document on document_items (document_id);

create table if not exists document_taxes (
  id bigserial primary key,
  document_id uuid not null references documents(id) on delete cascade,
  rate numeric(6,4),          -- 0.19 etc.
  base numeric(14,2),         -- Steuerbasis
  amount numeric(14,2),       -- Steuerbetrag
  category text               -- normal/reduced/zero, falls ermittelbar
);

create index if not exists idx_taxes_document on document_taxes (document_id);
