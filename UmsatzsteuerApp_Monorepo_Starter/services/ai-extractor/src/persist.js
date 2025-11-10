import crypto from 'crypto';
import { query } from './db.js';

function sha256(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

export async function saveFileAndDocument({
  buffer,
  originalName,
  mimeType,
  raw,
  normalized,
  docKind,
  sourceModel,
  modelConfidence
}) {
  const hash = sha256(buffer);
  const size = buffer?.length ?? null;

  // Datei anlegen/finden
  const upsertFile = `
    WITH ins AS (
      INSERT INTO uploaded_files (file_sha256, original_filename, mime_type, byte_size, file_bytes)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (file_sha256) DO UPDATE
        SET original_filename = EXCLUDED.original_filename,
            mime_type = EXCLUDED.mime_type,
            byte_size = EXCLUDED.byte_size
      RETURNING id
    )
    SELECT id FROM ins
    UNION
    SELECT id FROM uploaded_files WHERE file_sha256 = $1
    LIMIT 1;
  `;
  const fileRes = await query(upsertFile, [hash, originalName, mimeType, size, buffer]);
  const fileId = fileRes.rows[0].id;

  // Normalisierte Felder für schnelle Filter
  const n = normalized || {};
  const pick = (obj, keyArr) =>
    Object.fromEntries(keyArr.map(k => [k, obj?.[k] ?? null]));

  const flattened = {
    chart_of_accounts: n.chartOfAccounts ?? 'SKR03',
    creditor_name: n?.creditor?.name ?? n?.supplier?.name ?? null,
    debtor_name:   n?.debtor?.name   ?? n?.customer?.name ?? null,
    creditor_tax_id: n?.creditor?.taxId ?? null,
    debtor_tax_id:   n?.debtor?.taxId   ?? null,
    invoice_number: n.invoiceNumber ?? null,
    invoice_date: n.invoiceDate ? new Date(n.invoiceDate) : null,
    currency: n.currency ?? null,
    subtotal: n.subtotal ?? n.totalNet ?? null,
    tax_amount: n.taxAmount ?? null,
    tax_rate: n.taxRate ?? null,
    total_amount: n.totalAmount ?? null,
    iban: n.iban ?? null,
    bic: n.bic ?? null,
    vat_country_code: n.vatCountryCode ?? null
  };

  const insertDoc = `
    INSERT INTO documents (
      file_id, doc_kind, source_model, model_confidence,
      raw_json, normalized,
      chart_of_accounts, creditor_name, debtor_name, creditor_tax_id, debtor_tax_id,
      invoice_number, invoice_date, currency, subtotal, tax_amount, tax_rate, total_amount,
      iban, bic, vat_country_code
    )
    VALUES (
      $1, $2, $3, $4,
      $5, $6,
      $7, $8, $9, $10, $11,
      $12, $13, $14, $15, $16, $17, $18,
      $19, $20, $21
    )
    RETURNING id;
  `;

  const docRes = await query(insertDoc, [
    fileId, docKind, sourceModel, modelConfidence ?? null,
    raw, normalized,
    flattened.chart_of_accounts, flattened.creditor_name, flattened.debtor_name,
    flattened.creditor_tax_id, flattened.debtor_tax_id,
    flattened.invoice_number, flattened.invoice_date, flattened.currency,
    flattened.subtotal, flattened.tax_amount, flattened.tax_rate, flattened.total_amount,
    flattened.iban, flattened.bic, flattened.vat_country_code
  ]);
  const documentId = docRes.rows[0].id;

  // Zeilen (falls vorhanden)
  if (Array.isArray(n.lines)) {
    let lineNo = 1;
    for (const L of n.lines) {
      await query(
        `INSERT INTO document_lines
          (document_id, line_no, description, quantity, unit_price, net_amount, tax_rate, tax_amount, account_code, vat_code)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [
          documentId,
          L.lineNo ?? lineNo++,
          L.description ?? null,
          L.quantity ?? null,
          L.unitPrice ?? null,
          L.netAmount ?? null,
          L.taxRate ?? null,
          L.taxAmount ?? null,
          L.accountCode ?? null,
          L.vatCode ?? null
        ]
      );
    }
  }

  return { fileId, documentId, hash };
}
