// services/ai-extractor/src/persist.js
import { query } from "./db.js";
import crypto from "node:crypto";

function sha256(buf) {
  return crypto.createHash("sha256").update(buf).digest("hex");
}

function numOrNull(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export async function persistReceipt(normalized, fileBytes) {
  const storeBytes = String(process.env.STORE_FILE_BYTES || "").toLowerCase() === "true";
  const fileSha256 = sha256(fileBytes);

  const {
    fileName, mimeType,
    model, score, source,
    xmlType, xmlVersion,
    currency, subtotal, tax, total,
    vendorName, vendorVatId,
    buyerName, buyerVatId,
    invoiceNumber, invoiceDate, dueDate,
    iban, bic,
    chartOfAccounts,
    creditorName, debtorName,
    taxRateGuess,
    items,
    mappedJson, rawJson
  } = normalized;

  const insertReceiptSQL = `
    INSERT INTO receipts (
      file_name, mime_type, file_sha256,
      model, score, source,
      xml_type, xml_version,
      currency, subtotal, tax, total,
      vendor_name, vendor_vat_id,
      buyer_name, buyer_vat_id,
      invoice_number, invoice_date, due_date,
      iban, bic,
      chart_of_accounts, creditor_name, debtor_name,
      tax_rate_guess,
      mapped_json, raw_json,
      file_bytes
    )
    VALUES (
      $1,$2,$3,
      $4,$5,$6,
      $7,$8,
      $9,$10,$11,$12,
      $13,$14,
      $15,$16,
      $17,$18,$19,
      $20,$21,
      $22,$23,$24,
      $25,
      $26::jsonb,$27::jsonb,
      $28
    )
    RETURNING id
  `;

  const params = [
    fileName, mimeType, fileSha256,
    model, numOrNull(score), source || null,
    xmlType || null, xmlVersion || null,
    currency || "EUR", numOrNull(subtotal), numOrNull(tax), numOrNull(total),
    vendorName || null, vendorVatId || null,
    buyerName || null, buyerVatId || null,
    invoiceNumber || null, invoiceDate || null, dueDate || null,
    iban || null, bic || null,
    chartOfAccounts || null, creditorName || null, debtorName || null,
    numOrNull(taxRateGuess),
    JSON.stringify(mappedJson || {}), JSON.stringify(rawJson || {}),
    storeBytes ? fileBytes : null
  ];

  const { rows } = await query(insertReceiptSQL, params);
  const receiptId = rows[0].id;

  // Items
  if (Array.isArray(items) && items.length) {
    const insertItemSQL = `
      INSERT INTO receipt_items (
        receipt_id, position_no, description,
        quantity, unit_price, amount_net, tax_rate
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7)
    `;
    for (const it of items) {
      await query(insertItemSQL, [
        receiptId,
        it.positionNo || null,
        it.description || null,
        numOrNull(it.quantity),
        numOrNull(it.unitPrice),
        numOrNull(it.amountNet),
        numOrNull(it.taxRate)
      ]);
    }
  }

  return { receiptId, fileSha256 };
}
