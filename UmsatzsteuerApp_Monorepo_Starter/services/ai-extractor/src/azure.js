// services/ai-extractor/src/azure.js
// Minimaler Azure Document Intelligence Client mit Fallback-Logik:
// 1) prebuilt-invoice → 2) prebuilt-receipt → 3) layout → 4) read

const endpoint = process.env.AZURE_ENDPOINT?.replace(/\/+$/, "") || "";
const apiKey = process.env.AZURE_KEY || "";
const apiVersion = process.env.AZURE_API_VERSION || "2023-10-31";
const THRESH = Number(process.env.MODEL_CONFIDENCE_THRESHOLD || 0.8);

function ensureEnv() {
  if (!endpoint || !apiKey) {
    throw new Error("AZURE_ENDPOINT/AZURE_KEY not set");
  }
}

async function postAnalyze(modelId, bytes) {
  const url = `${endpoint}/documentintelligence/documentModels/${modelId}:analyze?api-version=${apiVersion}`;
  const r = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/octet-stream",
      // Für DI gilt i.d.R. dieser Header; "api-key" funktioniert in neuen Regionen ebenfalls.
      "Ocp-Apim-Subscription-Key": apiKey,
      "api-key": apiKey
    },
    body: bytes
  });

  if (r.status !== 202) {
    const t = await r.text().catch(() => "");
    throw new Error(`Azure analyze POST failed: ${r.status} ${t}`);
  }
  const op = r.headers.get("operation-location");
  if (!op) throw new Error("Azure missing operation-location header");
  return await pollOperation(op);
}

async function pollOperation(opUrl) {
  for (let i = 0; i < 60; i++) {
    const r = await fetch(opUrl, {
      headers: {
        "Ocp-Apim-Subscription-Key": apiKey,
        "api-key": apiKey
      }
    });
    if (!r.ok) {
      const t = await r.text().catch(() => "");
      throw new Error(`Azure poll failed: ${r.status} ${t}`);
    }
    const data = await r.json();
    const status = data.status || data?.analyzeResult?.status;
    if (status === "succeeded") return data;
    if (status === "failed") throw new Error("Azure analyze failed");
    await new Promise((res) => setTimeout(res, 1000));
  }
  throw new Error("Azure analyze timed out");
}

function avgConfidenceFromFields(obj) {
  if (!obj || typeof obj !== "object") return null;
  let sum = 0;
  let n = 0;

  const scan = (v) => {
    if (!v) return;
    if (typeof v.confidence === "number") {
      sum += v.confidence;
      n++;
    }
    if (v.valueObject && typeof v.valueObject === "object") {
      Object.values(v.valueObject).forEach(scan);
    }
    if (Array.isArray(v.valueArray)) {
      v.valueArray.forEach(scan);
    }
    if (v.fields && typeof v.fields === "object") {
      Object.values(v.fields).forEach(scan);
    }
  };

  if (obj.fields) {
    Object.values(obj.fields).forEach(scan);
  } else {
    Object.values(obj).forEach(scan);
  }
  return n ? sum / n : null;
}

function pickField(doc, name) {
  return doc?.fields?.[name]?.content ?? doc?.fields?.[name]?.value ?? doc?.fields?.[name]?.valueString ?? null;
}
function pickNum(doc, name) {
  const v = doc?.fields?.[name]?.valueNumber ?? doc?.fields?.[name]?.valueCurrency?.amount ?? doc?.fields?.[name]?.content;
  const n = Number(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : null;
}
function pickDate(doc, name) {
  return doc?.fields?.[name]?.valueDate ?? doc?.fields?.[name]?.content ?? null;
}
function pickCurrencyCode(doc, nameTotal) {
  // versucht Währung an Total/SubTotal zu finden
  const c =
    doc?.fields?.[nameTotal]?.valueCurrency?.currencyCode ??
    doc?.fields?.Total?.valueCurrency?.currencyCode ??
    doc?.fields?.SubTotal?.valueCurrency?.currencyCode ??
    null;
  return c || null;
}

function mapInvoice(analyze) {
  const doc = analyze?.analyzeResult?.documents?.[0];
  const score = avgConfidenceFromFields(doc) ?? null;
  const mapped = {
    vendorName: pickField(doc, "VendorName"),
    vendorVatId: pickField(doc, "VendorTaxId") || pickField(doc, "VendorVatNumber"),
    buyerName: pickField(doc, "CustomerName"),
    buyerVatId: pickField(doc, "CustomerTaxId") || pickField(doc, "CustomerVatNumber"),
    invoiceNumber: pickField(doc, "InvoiceId") || pickField(doc, "InvoiceNumber"),
    invoiceDate: pickDate(doc, "InvoiceDate"),
    dueDate: pickDate(doc, "DueDate"),
    currency: pickCurrencyCode(doc, "Total") || "EUR",
    subtotal: pickNum(doc, "SubTotal"),
    tax: pickNum(doc, "TotalTax") ?? pickNum(doc, "Tax"),
    total: pickNum(doc, "Total"),
    iban: pickField(doc, "VendorBankAccountNumber") || null,
    bic: pickField(doc, "VendorBankBic") || null,
    items: [],
    confidence: score ?? undefined,
    source: "azure:invoice"
  };

  // Items
  const items = doc?.fields?.Items?.valueArray || [];
  mapped.items = items.map((it, idx) => {
    const f = it?.valueObject?.fields || it?.fields || {};
    const q = f?.Quantity?.valueNumber ?? null;
    const up =
      f?.UnitPrice?.valueCurrency?.amount ??
      f?.UnitPrice?.valueNumber ??
      null;
    const amt =
      f?.Amount?.valueCurrency?.amount ??
      f?.Amount?.valueNumber ??
      null;
    return {
      positionNo: idx + 1,
      description: f?.Description?.content ?? null,
      quantity: q,
      unitPrice: up,
      amountNet: amt,
      taxRate: f?.TaxRate?.valueNumber ?? null
    };
  });

  return { model: "invoice", score, mapped, raw: analyze };
}

function mapReceipt(analyze) {
  const doc = analyze?.analyzeResult?.documents?.[0];
  const score = avgConfidenceFromFields(doc) ?? null;
  const mapped = {
    vendorName: pickField(doc, "MerchantName"),
    vendorVatId: null,
    buyerName: null,
    buyerVatId: null,
    invoiceNumber: pickField(doc, "TransactionId") || null,
    invoiceDate: pickDate(doc, "TransactionDate"),
    dueDate: null,
    currency: pickCurrencyCode(doc, "Total") || "EUR",
    subtotal: pickNum(doc, "SubTotal"),
    tax: pickNum(doc, "TotalTax") ?? pickNum(doc, "Tax"),
    total: pickNum(doc, "Total"),
    iban: null,
    bic: null,
    items: [],
    confidence: score ?? undefined,
    source: "azure:receipt"
  };

  const items = doc?.fields?.Items?.valueArray || [];
  mapped.items = items.map((it, idx) => {
    const f = it?.valueObject?.fields || it?.fields || {};
    const q = f?.Quantity?.valueNumber ?? null;
    const up =
      f?.UnitPrice?.valueCurrency?.amount ??
      f?.UnitPrice?.valueNumber ??
      null;
    const amt =
      f?.TotalPrice?.valueCurrency?.amount ??
      f?.TotalPrice?.valueNumber ??
      null;
    return {
      positionNo: idx + 1,
      description: f?.Description?.content ?? null,
      quantity: q,
      unitPrice: up,
      amountNet: amt,
      taxRate: null
    };
  });

  return { model: "receipt", score, mapped, raw: analyze };
}

function mapLayout(analyze) {
  // Layout liefert Seiten/Spans – hier nur minimaler Stub
  const score = null;
  const mapped = {
    vendorName: null,
    vendorVatId: null,
    buyerName: null,
    buyerVatId: null,
    invoiceNumber: null,
    invoiceDate: null,
    dueDate: null,
    currency: "EUR",
    subtotal: null,
    tax: null,
    total: null,
    iban: null,
    bic: null,
    items: [],
    confidence: null,
    source: "azure:layout"
  };
  return { model: "layout", score, mapped, raw: analyze };
}

function mapRead(analyze) {
  const score = null;
  const mapped = {
    vendorName: null,
    vendorVatId: null,
    buyerName: null,
    buyerVatId: null,
    invoiceNumber: null,
    invoiceDate: null,
    dueDate: null,
    currency: "EUR",
    subtotal: null,
    tax: null,
    total: null,
    iban: null,
    bic: null,
    items: [],
    confidence: null,
    source: "azure:read"
  };
  return { model: "read", score, mapped, raw: analyze };
}

export async function analyzeWithAzure(bytes /*, fileName */) {
  ensureEnv();

  // 1) Invoice
  try {
    const inv = await postAnalyze("prebuilt-invoice", bytes);
    const mapped = mapInvoice(inv);
    if ((mapped.score ?? 0) >= THRESH || mapped.mapped.invoiceNumber || mapped.mapped.total) {
      return mapped;
    }
  } catch (_) {
    // fall through
  }

  // 2) Receipt
  try {
    const rec = await postAnalyze("prebuilt-receipt", bytes);
    const mapped = mapReceipt(rec);
    if ((mapped.score ?? 0) >= THRESH || mapped.mapped.total || mapped.mapped.vendorName) {
      return mapped;
    }
  } catch (_) {
    // fall through
  }

  // 3) Layout
  try {
    const lay = await postAnalyze("prebuilt-layout", bytes);
    return mapLayout(lay);
  } catch (_) {
    // fall through
  }

  // 4) Read
  const read = await postAnalyze("prebuilt-read", bytes);
  return mapRead(read);
}
