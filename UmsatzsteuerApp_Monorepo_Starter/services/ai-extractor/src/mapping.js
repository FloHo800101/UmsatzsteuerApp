// services/ai-extractor/src/mapping.js
// ESM-kompatibel (Node >= 18). Exportiert mapFromModel (named) + default.

// ---------- Hilfsfunktionen ----------
const isString = (v) => typeof v === "string";
const isNumber = (v) => typeof v === "number";

const toNumber = (v) => {
  if (v == null) return null;
  if (isNumber(v)) return v;
  if (isString(v)) {
    // deutsche Formatierung "1.234,56" -> 1234.56
    const cleaned = v.replace(/\s/g, "").replace(/\./g, "").replace(",", ".");
    const num = Number.parseFloat(cleaned);
    return Number.isFinite(num) ? num : null;
  }
  return null;
};

const getStr = (field) => field?.valueString ?? field?.content ?? null;
const getDateStr = (field) =>
  // Behalte bevorzugt das Format aus dem Dokument (z. B. 07.10.2022)
  field?.content ?? field?.valueDate ?? null;

const getCurrencyAmount = (field) =>
  field?.valueCurrency?.amount ??
  toNumber(field?.content ?? field?.valueString);

const getCurrencyCodeFromField = (field) => {
  const code = field?.valueCurrency?.currencyCode;
  if (code) return code;
  const sym = field?.valueCurrency?.currencySymbol || field?.content || "";
  if (sym.includes("€")) return "EUR";
  if (sym.includes("$")) return "USD";
  if (sym.includes("£")) return "GBP";
  return null;
};

const safeArray = (a) => (Array.isArray(a) ? a : []);
const firstDoc = (ar) => (ar && Array.isArray(ar.documents) ? ar.documents[0] : null);

// ---------- Mapper für INVOICE ----------
function mapInvoiceDoc(doc) {
  const f = doc?.fields ?? {};

  // Items (Invoice)
  const items = safeArray(f?.Items?.valueArray).map((entry) => {
    const o = entry?.valueObject ?? {};
    const qty =
      o?.Quantity?.valueNumber ??
      toNumber(o?.Quantity?.content ?? o?.Quantity?.valueString);
    const unitPrice =
      o?.UnitPrice?.valueCurrency?.amount ??
      o?.Price?.valueCurrency?.amount ??
      toNumber(o?.UnitPrice?.content ?? o?.Price?.content);
    const amount =
      o?.Amount?.valueCurrency?.amount ??
      o?.TotalPrice?.valueCurrency?.amount ??
      toNumber(o?.Amount?.content ?? o?.TotalPrice?.content);

    return {
      description: getStr(o?.Description),
      quantity: qty ?? null,
      unitPrice: unitPrice ?? null,
      amount: amount ?? null,
      tax:
        o?.Tax?.valueCurrency?.amount ??
        toNumber(o?.Tax?.content ?? o?.Tax?.valueString) ??
        null,
    };
  });

  // Steuerbetrag: TotalTax oder erster Eintrag in TaxDetails
  const taxFromDetails = (() => {
    const td = safeArray(f?.TaxDetails?.valueArray);
    if (!td.length) return null;
    const obj = td[0]?.valueObject;
    return obj?.Amount?.valueCurrency?.amount ?? toNumber(obj?.Amount?.content);
  })();

  const totalField = f?.InvoiceTotal;
  const subtotalField = f?.SubTotal;

  return {
    type: "invoice",
    vendorName: getStr(f?.VendorName) ?? getStr(f?.VendorAddressRecipient),
    vendorVatId: getStr(f?.VendorTaxId) ?? null,
    invoiceNumber: getStr(f?.InvoiceId),
    invoiceDate: getDateStr(f?.InvoiceDate),
    dueDate: getDateStr(f?.DueDate),
    currency: getCurrencyCodeFromField(totalField) ?? getCurrencyCodeFromField(subtotalField),
    subtotal: getCurrencyAmount(subtotalField),
    tax: getCurrencyAmount(f?.TotalTax) ?? taxFromDetails,
    total: getCurrencyAmount(totalField),
    items,
    confidence: doc?.confidence ?? null,
    source: "prebuilt-invoice",
  };
}

// ---------- Mapper für RECEIPT ----------
function mapReceiptDoc(doc) {
  const f = doc?.fields ?? {};

  const items = safeArray(f?.Items?.valueArray).map((entry) => {
    const o = entry?.valueObject ?? {};
    // Azure Receipt-Felder heißen meist Description/Quantity/Price/TotalPrice
    return {
      description: getStr(o?.Description),
      quantity:
        o?.Quantity?.valueNumber ??
        toNumber(o?.Quantity?.content ?? o?.Quantity?.valueString),
      unitPrice:
        o?.Price?.valueCurrency?.amount ??
        toNumber(o?.Price?.content ?? o?.Price?.valueString),
      amount:
        o?.TotalPrice?.valueCurrency?.amount ??
        toNumber(o?.TotalPrice?.content ?? o?.TotalPrice?.valueString),
      tax:
        o?.Tax?.valueCurrency?.amount ??
        toNumber(o?.Tax?.content ?? o?.Tax?.valueString) ??
        null,
    };
  });

  const totalField = f?.Total;
  const subtotalField = f?.Subtotal;

  return {
    type: "receipt",
    vendorName: getStr(f?.MerchantName),
    vendorVatId: null, // bei Kassenbelegen selten explizit vorhanden
    invoiceNumber: null,
    invoiceDate: getDateStr(f?.TransactionDate),
    dueDate: null,
    currency: getCurrencyCodeFromField(totalField) ?? getCurrencyCodeFromField(subtotalField),
    subtotal: getCurrencyAmount(subtotalField),
    tax: getCurrencyAmount(f?.Tax),
    total: getCurrencyAmount(totalField),
    items,
    confidence: doc?.confidence ?? null,
    source: "prebuilt-receipt",
  };
}

// ---------- Heuristischer Fallback für layout/read ----------
function mapHeuristicFromContent(analyzeResult) {
  const content = analyzeResult?.content || "";

  // sehr einfache Heuristiken für NETTO/BRUTTO/MWST
  const num = (s) => (s ? toNumber(s) : null);
  const rx = (label) =>
    new RegExp(`${label}\\s*[:\\-]?\\s*([0-9\\.\\s]*,[0-9]{2}|[0-9]+\\.[0-9]{2})`, "i");

  const mNetto = content.match(rx("NETTO"));
  const mBrutto = content.match(rx("BRUTTO|TOTAL|SUMME"));
  const mMwst = content.match(rx("MWST|MwSt|UST|USt|VAT|Tax"));

  // Datum rudimentär (DD.MM.YYYY)
  const mDate = content.match(/\b([0-3]?\d\.[01]?\d\.\d{4})\b/);
  // einfacher Name oben im Dokument (erste Zeile bis Zeilenumbruch)
  const firstLine = content.split(/\n/)[0]?.trim() || null;

  return {
    type: "ocr",
    vendorName: firstLine || null,
    vendorVatId: null,
    invoiceNumber: null,
    invoiceDate: mDate ? mDate[1] : null,
    dueDate: null,
    currency: content.includes("€") ? "EUR" : null,
    subtotal: num(mNetto?.[1]),
    tax: num(mMwst?.[1]),
    total: num(mBrutto?.[1]),
    items: [],
    confidence: null,
    source: analyzeResult?.modelId || "layout/read",
  };
}

// ---------- Dispatcher ----------
function _dispatchMap(model, raw) {
  const ar = raw?.analyzeResult ?? raw; // toleriert raw oder raw.analyzeResult
  const modelId = (model || ar?.modelId || "").toLowerCase();
  const doc = firstDoc(ar);

  if (modelId.includes("prebuilt-invoice") && doc) {
    return mapInvoiceDoc(doc);
  }
  if (modelId.includes("prebuilt-receipt") && doc) {
    return mapReceiptDoc(doc);
  }

  // Fallback: layout/read → heuristisch aus analyzeResult.content
  return mapHeuristicFromContent(ar);
}

// ---------- Öffentliche API ----------
// Toleriert beide Aufrufvarianten: (model, raw) **oder** (raw, model)
export function mapFromAzure(...args) {
  let model, raw;
  if (typeof args[0] === "string") {
    [model, raw] = args; // (model, raw)
  } else {
    [raw, model] = args; // (raw, model)
  }
  return _dispatchMap(model, raw);
}

// Alias, damit server.js beide Exporte nutzen kann:
export const mapFromModel = (...args) => mapFromAzure(...args);
export default mapFromAzure;
