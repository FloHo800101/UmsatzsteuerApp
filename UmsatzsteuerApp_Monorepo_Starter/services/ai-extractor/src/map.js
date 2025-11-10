/**
 * Hilfsfunktionen, um Werte sicher aus Azure-DI Results zu lesen
 */
function getField(doc, name) {
  return doc?.fields?.[name]?.value ?? doc?.fields?.[name]?.content ?? null;
}
function getNumber(doc, name) {
  const v = doc?.fields?.[name]?.value ?? doc?.fields?.[name]?.amount ?? null;
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
function toDateStr(v) {
  if (!v) return null;
  // Azure liefert manchmal YYYY-MM-DD, manchmal ISO – wir normalisieren auf YYYY-MM-DD
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

function pickFirstDocument(azureResult) {
  const docs = azureResult?.analyzeResult?.documents || [];
  return docs[0] || null;
}

// Grober Feld-Score (Mittelwert einiger Kernfelder), rein heuristisch
function computeConfidence(doc) {
  const f = doc?.fields || {};
  const keys = ["VendorName", "InvoiceId", "InvoiceDate", "Total", "Subtotal"];
  const vals = keys
    .map(k => (f[k]?.confidence != null ? Number(f[k].confidence) : null))
    .filter(v => v != null);
  if (!vals.length) return null;
  const sum = vals.reduce((a, b) => a + b, 0);
  return (sum / vals.length).toFixed(4);
}

function parseItems(doc) {
  const itemsField = doc?.fields?.Items?.value || doc?.fields?.Items?.valueArray;
  if (!Array.isArray(itemsField)) return [];
  const items = [];
  for (const it of itemsField) {
    const f = it?.valueObject || it?.fields || {};
    const desc =
      f.Description?.value ?? f.Description?.content ?? f.ProductCode?.value ?? null;
    const qty = Number(f.Quantity?.value ?? f.Quantity?.amount ?? f.Quantity?.content);
    const unit = Number(
      f.UnitPrice?.value ?? f.UnitPrice?.amount ?? f.UnitPrice?.content
    );
    const amount = Number(
      f.Amount?.value ?? f.Amount?.amount ?? f.Amount?.content
    );
    // TaxRate kommt oft als 19%, 7%, … → auf 0.19 normalisieren
    let rate = f.Tax?.value ?? f.Tax?.content ?? f.TaxRate?.value ?? null;
    if (typeof rate === "string" && rate.includes("%")) {
      const num = Number(rate.replace(",", ".").replace("%", "").trim());
      rate = Number.isFinite(num) ? num / 100 : null;
    } else {
      const n = Number(rate);
      rate = Number.isFinite(n) ? n : null;
    }
    items.push({
      description: desc || null,
      quantity: Number.isFinite(qty) ? qty : null,
      unitPrice: Number.isFinite(unit) ? unit : null,
      amount: Number.isFinite(amount) ? amount : null,
      taxRate: Number.isFinite(rate) ? rate : null
    });
  }
  return items;
}

function parseTaxes(doc) {
  const taxesField =
    doc?.fields?.Taxes?.valueArray || doc?.fields?.TaxDetails?.valueArray;
  const taxes = [];
  if (Array.isArray(taxesField)) {
    for (const t of taxesField) {
      const f = t?.valueObject || t?.fields || {};
      let rate =
        f.Rate?.value ?? f.Rate?.content ?? f.TaxRate?.value ?? f.TaxRate?.content;
      if (typeof rate === "string" && rate.includes("%")) {
        const num = Number(rate.replace(",", ".").replace("%", "").trim());
        rate = Number.isFinite(num) ? num / 100 : null;
      } else {
        const n = Number(rate);
        rate = Number.isFinite(n) ? n : null;
      }
      const amount =
        Number(f.Amount?.value ?? f.Amount?.amount ?? f.Amount?.content) ?? null;
      const base =
        Number(f.Base?.value ?? f.Base?.amount ?? f.Base?.content) ?? null;
      const category =
        f.Category?.value ?? f.Category?.content ?? null;
      taxes.push({
        rate: Number.isFinite(rate) ? rate : null,
        amount: Number.isFinite(amount) ? amount : null,
        base: Number.isFinite(base) ? base : null,
        category
      });
    }
  }
  return taxes;
}

export function mapFromAzure(model, azureResult, { defaultChart = "SKR03" } = {}) {
  const doc = pickFirstDocument(azureResult);
  const fields = doc?.fields || {};
  const modelConfidence = doc ? Number(computeConfidence(doc)) : null;

  // Heuristik: Invoice => Kreditor; später unterstützt die App auch Ausgangsrechnungen (Debitor)
  const partnerType = "creditor";

  const vendorName = getField(doc, "VendorName");
  const vendorTaxId =
    getField(doc, "VendorTaxId") || getField(doc, "SupplierTaxId") || null;

  const customerName =
    getField(doc, "CustomerName") || getField(doc, "BillToName") || null;

  const invoiceNumber =
    getField(doc, "InvoiceId") || getField(doc, "ReceiptId") || null;

  const invoiceDate =
    toDateStr(getField(doc, "InvoiceDate")) || toDateStr(getField(doc, "TransactionDate"));

  const dueDate = toDateStr(getField(doc, "DueDate"));

  const currency =
    fields.Total?.content?.replace(/[0-9\.\,\s]/g, "") ||
    fields.Subtotal?.content?.replace(/[0-9\.\,\s]/g, "") ||
    getField(doc, "Currency") ||
    null;

  const subtotal = getNumber(doc, "Subtotal");
  const total = getNumber(doc, "Total");
  // total_tax wird aus Taxes abgeleitet, wenn verfügbar
  const taxes = parseTaxes(doc);
  const totalTax =
    taxes.length
      ? taxes
          .map(t => (Number.isFinite(t.amount) ? t.amount : 0))
          .reduce((a, b) => a + b, 0)
      : getNumber(doc, "TotalTax");

  // Oberste (dominante) Tax-Rate ableiten (z. B. 0.19)
  const primaryRate =
    taxes.find(t => Number.isFinite(t.rate) && t.rate > 0)?.rate ?? null;

  const items = parseItems(doc);

  const mapped = {
    docType:
      model === "prebuilt-invoice"
        ? "invoice"
        : model === "prebuilt-receipt"
        ? "receipt"
        : "ocr",
    partnerType,
    vendorName,
    vendorTaxId,
    customerName,
    invoiceNumber,
    invoiceDate,
    dueDate,
    currency,
    subtotal: Number.isFinite(subtotal) ? subtotal : null,
    totalTax: Number.isFinite(totalTax) ? totalTax : null,
    total: Number.isFinite(total) ? total : null,
    netAmount:
      Number.isFinite(total) && Number.isFinite(totalTax) ? total - totalTax : null,
    grossAmount: Number.isFinite(total) ? total : null,
    taxRate: Number.isFinite(primaryRate) ? primaryRate : null,

    // Kontenrahmen (Platzhalter/Vorschlag – KI-Vorschlag folgt später)
    chartOfAccounts: defaultChart,
    accountNumber: null,
    accountName: null,
    accountSuggestionConfidence: null
  };

  return { mapped, items, taxes, modelConfidence };
}
