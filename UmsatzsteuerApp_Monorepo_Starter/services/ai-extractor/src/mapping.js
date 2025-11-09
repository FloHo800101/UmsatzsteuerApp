// mapping.js – Azure DI → App-Format (robust inkl. Fallbacks)

function round2(n) { return (typeof n === "number") ? Math.round(n * 100) / 100 : n; }

function pickStr(f) {
  if (!f) return null;
  return typeof f.valueString === "string" ? f.valueString : (f.content ?? null);
}
function pickDate(f) {
  if (!f) return null;
  if (f.valueDate) return f.valueDate; // ISO (yyyy-mm-dd)
  return pickStr(f);
}
function pickCurrency(f) {
  if (!f) return { amount: null, code: null, symbol: null };
  const vc = f.valueCurrency || {};
  if (typeof vc.amount === "number")
    return { amount: vc.amount, code: vc.currencyCode || null, symbol: vc.currencySymbol || null };
  if (typeof f.valueNumber === "number")
    return { amount: f.valueNumber, code: null, symbol: null };
  return { amount: null, code: null, symbol: null };
}

export function mapFromAzure(raw, modelId, confidence) {
  const doc = raw?.analyzeResult?.documents?.[0] || {};
  const fields = doc.fields || {};
  const get = (name) => fields[name];

  // Stammdaten
  const vendorName   = pickStr(get("VendorName"));
  const vendorVatId  = pickStr(get("VendorTaxId")) || pickStr(get("VendorVatId")) || pickStr(get("VendorRegistrationId"));
  const invoiceNo    = pickStr(get("InvoiceId")) || pickStr(get("InvoiceNumber"));
  const invoiceDate  = pickDate(get("InvoiceDate"));
  const dueDate      = pickDate(get("DueDate"));

  // Beträge
  const invTot = pickCurrency(get("InvoiceTotal"));
  const subTot = pickCurrency(get("SubTotal"));
  const totTax = pickCurrency(get("TotalTax"));
  const currency = invTot.code || subTot.code || totTax.code || null;

  // Positionen
  const itemsField = get("Items");
  let items = [];
  if (itemsField?.type === "array" && Array.isArray(itemsField.valueArray)) {
    items = itemsField.valueArray.map((row) => {
      const obj = row?.valueObject || {};
      const desc = pickStr(obj.Description);
      const qty  = (typeof obj?.Quantity?.valueNumber === "number") ? obj.Quantity.valueNumber : null;
      const up   = pickCurrency(obj.UnitPrice).amount;
      const amt  = pickCurrency(obj.Amount).amount;
      const tax  = pickCurrency(obj.Tax).amount;
      return {
        description: desc ?? null,
        quantity: qty,
        unitPrice: (up != null) ? round2(up) : null,
        amount: (amt != null) ? round2(amt) : null,
        tax: (tax != null) ? round2(tax) : null,
      };
    });
  }

  // Fallbacks berechnen
  let subtotal = (subTot.amount != null) ? round2(subTot.amount) : null;
  if (subtotal == null) {
    const sumItems = items.reduce((s, it) => s + (typeof it.amount === "number" ? it.amount : 0), 0);
    if (sumItems > 0) subtotal = round2(sumItems);
  }

  let tax   = (totTax.amount != null) ? round2(totTax.amount) : null;
  let total = (invTot.amount != null) ? round2(invTot.amount) : null;
  if (total == null && subtotal != null && tax != null) total = round2(subtotal + tax);

  // Letzter Fallback: wenn keinerlei Positionen erkannt, eine Sammelposition mit Gesamtbetrag
  if (!items.length && (total != null)) {
    items = [{ description: null, quantity: null, unitPrice: null, amount: total, tax }];
  }

  return {
    type: doc.docType || modelId || "invoice",
    vendorName: vendorName || null,
    vendorVatId: vendorVatId || null,
    invoiceNumber: invoiceNo || null,
    invoiceDate: invoiceDate || null,   // ISO; UI kann in de-DE formatieren
    dueDate: dueDate || null,
    currency,
    subtotal,
    tax,
    total,
    items,
    confidence: (typeof doc.confidence === "number") ? doc.confidence : (confidence ?? null),
    source: modelId,
  };
}
