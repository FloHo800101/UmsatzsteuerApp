import { Pool } from "pg";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is not set");
}

export const pool = new Pool({
  connectionString,
  ssl: /sslmode=require/.test(connectionString)
    ? { rejectUnauthorized: false }
    : undefined
});

export async function migrateIfNeeded(sqlText) {
  const client = await pool.connect();
  try {
    await client.query("begin");
    await client.query(sqlText);
    await client.query("commit");
  } catch (e) {
    await client.query("rollback");
    console.error("Migration failed:", e);
    throw e;
  } finally {
    client.release();
  }
}

export async function insertDocumentWithDetails({
  meta,
  mapped,
  raw,
  items,
  taxes,
  fileBytes
}) {
  const client = await pool.connect();
  try {
    await client.query("begin");

    const docRes = await client.query(
      `
      insert into documents (
        filename, file_mime, file_size, file_sha256, file_bytes,
        source_model, model_confidence, doc_type,
        partner_type, vendor_name, vendor_tax_id, customer_name,
        invoice_number, invoice_date, due_date,
        currency, subtotal, total_tax, total, net_amount, gross_amount, tax_rate,
        chart_of_accounts, account_number, account_name, account_suggestion_confidence,
        raw_json
      ) values (
        $1,$2,$3,$4,$5,
        $6,$7,$8,
        $9,$10,$11,$12,
        $13,$14,$15,
        $16,$17,$18,$19,$20,$21,$22,
        $23,$24,$25,$26,
        $27
      ) returning id
      `,
      [
        meta.filename || null,
        meta.fileMime || null,
        meta.fileSize || null,
        meta.fileSha256 || null,
        fileBytes || null,

        meta.sourceModel || null,
        meta.modelConfidence ?? null,
        mapped.docType || null,

        mapped.partnerType || null,
        mapped.vendorName || null,
        mapped.vendorTaxId || null,
        mapped.customerName || null,

        mapped.invoiceNumber || null,
        mapped.invoiceDate || null,
        mapped.dueDate || null,

        mapped.currency || null,
        mapped.subtotal ?? null,
        mapped.totalTax ?? null,
        mapped.total ?? null,
        mapped.netAmount ?? null,
        mapped.grossAmount ?? null,
        mapped.taxRate ?? null,

        mapped.chartOfAccounts || null,
        mapped.accountNumber || null,
        mapped.accountName || null,
        mapped.accountSuggestionConfidence ?? null,

        raw ? JSON.stringify(raw) : null
      ]
    );

    const documentId = docRes.rows[0].id;

    if (Array.isArray(items) && items.length) {
      for (const [idx, it] of items.entries()) {
        await client.query(
          `
          insert into document_items
            (document_id, line_no, description, quantity, unit_price, amount, tax_rate)
          values
            ($1,$2,$3,$4,$5,$6,$7)
          `,
          [
            documentId,
            idx + 1,
            it.description || null,
            it.quantity ?? null,
            it.unitPrice ?? null,
            it.amount ?? null,
            it.taxRate ?? null
          ]
        );
      }
    }

    if (Array.isArray(taxes) && taxes.length) {
      for (const tx of taxes) {
        await client.query(
          `
          insert into document_taxes
            (document_id, rate, base, amount, category)
          values
            ($1,$2,$3,$4,$5)
          `,
          [
            documentId,
            tx.rate ?? null,
            tx.base ?? null,
            tx.amount ?? null,
            tx.category || null
          ]
        );
      }
    }

    await client.query("commit");
    return documentId;
  } catch (e) {
    await client.query("rollback");
    throw e;
  } finally {
    client.release();
  }
}
