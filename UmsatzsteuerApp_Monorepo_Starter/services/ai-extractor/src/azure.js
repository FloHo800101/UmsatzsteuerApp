// services/ai-extractor/src/azure.js
// Sequentielle Analyse mit Azure Document Intelligence:
// 1) prebuilt-invoice  → wenn score >= threshold → fertig
// 2) prebuilt-receipt  → wenn score >= threshold → fertig
// 3) prebuilt-layout   → (keine sicheren Felder, Mindest-Score 0.25)
// 4) read              → (reiner Text, Score 0.10)

const AZURE_ENDPOINT = process.env.AZURE_ENDPOINT;
const AZURE_KEY = process.env.AZURE_KEY;
const API_VERSION = process.env.AZURE_API_VERSION || "2023-10-31";

if (!AZURE_ENDPOINT || !AZURE_KEY) {
  console.warn("[azure] Missing AZURE_ENDPOINT or AZURE_KEY – the /extract route will fail against Azure.");
}

const SLEEP = (ms) => new Promise(r => setTimeout(r, ms));

async function pollResult(opLocation) {
  // Azure DI gibt eine Operation-URL zurück, die wir pollen müssen.
  for (let i = 0; i < 40; i++) {
    const r = await fetch(opLocation, {
      method: "GET",
      headers: { "Ocp-Apim-Subscription-Key": AZURE_KEY }
    });
    if (!r.ok) throw new Error(`Azure poll failed: ${r.status} ${r.statusText}`);
    const j = await r.json();
    const status = j.status || j?.analyzeResult?.status;
    if (status === "succeeded") return j;
    if (status === "failed") throw new Error("Azure analysis failed");
    await SLEEP(1000);
  }
  throw new Error("Azure poll timeout");
}

async function analyzeModel(modelId, bytes, mimeType) {
  const url = `${AZURE_ENDPOINT}/formrecognizer/documentModels/${modelId}:analyze?api-version=${API_VERSION}`;
  const r = await fetch(url, {
    method: "POST",
    headers: {
      "Ocp-Apim-Subscription-Key": AZURE_KEY,
      "Content-Type": mimeType || "application/octet-stream"
    },
    body: bytes
  });
  if (r.status !== 202) {
    const txt = await r.text().catch(() => "");
    throw new Error(`Azure analyze ${modelId} returned ${r.status}: ${txt}`);
  }
  const op = r.headers.get("operation-location");
  if (!op) throw new Error("Missing operation-location header from Azure");
  const result = await pollResult(op);
  return result;
}

function mapInvoiceLike(doc) {
  // doc = analyzeResult documents[0]
  const f = (doc && doc.fields) || {};
  const val = (k) => f[k]?.value || f[k]?.content || null;
  const conf = (k) => f[k]?.confidence ?? null;

  // Basisfelder
  const currency = f["InvoiceTotal"]?.valueCurrency?.code || f["Total"]?.valueCurrency?.code || null;
  const total = f["InvoiceTotal"]?.valueNumber ?? f["Total"]?.valueNumber ?? null;
  const subtotal = f["Subtotal"]?.valueNumber ?? null;

  // Steuer (simples Mapping)
  let tax = null;
  if (f["TotalTax"]?.valueNumber != null) tax = f["TotalTax"].valueNumber;
  else if (f["Tax"]?.valueNumber != null) tax = f["Tax"].valueNumber;

  // Parteien
  const vendorName = val("VendorName") || val("MerchantName") || null;
  const vendorVatId = val("VendorVATRegistrationNumber") || null;
  const buyerName = val("CustomerName") || val("BillToCustomerName") || null;
  const buyerVatId = val("CustomerVATRegistrationNumber") || null;

  // Rechnungsinfos
  const invoiceNumber = val("InvoiceId") || val("InvoiceNumber") || null;
  const invoiceDate = f["InvoiceDate"]?.valueDate || null;
  const dueDate = f["DueDate"]?.valueDate || null;

  // Bank
  const iban = val("VendorIBAN") || null;
  const bic = val("VendorSWIFT") || null;

  // Positionen (wenn verfügbar)
  const items = [];
  const lineItems = f["Items"]?.valueArray || f["Items"]?.value || [];
  if (Array.isArray(lineItems)) {
    for (const [i, li] of lineItems.entries()) {
      const lf = li?.valueObject?.properties || li?.valueObject || li?.properties || {};
      const get = (key) => lf[key]?.value ?? lf[key]?.content ?? null;
      const desc = get("Description") || get("ProductCode") || null;
      const qty = lf["Quantity"]?.valueNumber ?? null;
      const unitPrice = lf["UnitPrice"]?.valueNumber ?? null;
      const amountNet = lf["Amount"]?.valueNumber ?? null;
      // TaxRate ist oft nicht direkt vorhanden
      const taxRate = lf["TaxRate"]?.valueNumber ?? null;
      items.push({
        positionNo: i + 1,
        description: desc,
        quantity: qty,
        unitPrice,
        amountNet,
        taxRate
      });
    }
  }

  // Score: nimm Mittel aus ein paar Kernfeldern
  const confidences = [
    conf("InvoiceTotal") ?? conf("Total"),
    conf("Subtotal"),
    conf("TotalTax") ?? conf("Tax"),
    conf("VendorName") ?? conf("MerchantName"),
    conf("CustomerName") ?? conf("BillToCustomerName")
  ].filter((x) => typeof x === "number");
  const score =
    confidences.length ? Math.max(0.1, Math.min(1, confidences.reduce((a, b) => a + b, 0) / confidences.length)) : 0.5;

  return {
    score,
    mapped: {
      source: "azure",
      currency,
      total,
      subtotal,
      tax,
      vendorName,
      vendorVatId,
      buyerName,
      buyerVatId,
      invoiceNumber,
      invoiceDate,
      dueDate,
      iban,
      bic,
      items
    }
  };
}

function mapLayoutRead(docOrResult) {
  // Für layout/read haben wir keine strukturierten Felder → liefern Rohtext und minimale Felder
  // Wir geben eine niedrige, aber >0 Score zurück.
  const content = docOrResult?.analyzeResult?.content || "";
  return {
    score: docOrResult?.modelId?.includes("layout") ? 0.25 : 0.10,
    mapped: {
      source: "azure",
      currency: null,
      total: null,
      subtotal: null,
      tax: null,
      vendorName: null,
      buyerName: null,
      items: []
    },
    rawText: content
  };
}

export async function extractWithAzure({ bytes, mimeType, threshold }) {
  // 1) invoice
  try {
    const inv = await analyzeModel("prebuilt-invoice", bytes, mimeType);
    const doc = inv?.analyzeResult?.documents?.[0] || null;
    if (doc) {
      const m = mapInvoiceLike(doc);
      if (m.score >= threshold) {
        return { model: "invoice", score: m.score, mapped: m.mapped, raw: inv };
      }
      // sonst weiter testen
      var best = { model: "invoice", score: m.score, mapped: m.mapped, raw: inv };
    }
  } catch (e) {
    // still fallback
    var best = null;
  }

  // 2) receipt
  try {
    const rec = await analyzeModel("prebuilt-receipt", bytes, mimeType);
    const doc = rec?.analyzeResult?.documents?.[0] || null;
    if (doc) {
      const m = mapInvoiceLike(doc); // viele Felder sind ähnlich benannt
      if (m.score >= threshold) {
        return { model: "receipt", score: m.score, mapped: m.mapped, raw: rec };
      }
      if (!best || m.score > best.score) best = { model: "receipt", score: m.score, mapped: m.mapped, raw: rec };
    }
  } catch (e) {
    // ignore, fallback
  }

  // 3) layout
  try {
    const lay = await analyzeModel("prebuilt-layout", bytes, mimeType);
    const m = mapLayoutRead(lay);
    if (!best || m.score > best.score) best = { model: "layout", score: m.score, mapped: m.mapped, raw: lay };
  } catch (e) {
    // ignore
  }

  // 4) read
  try {
    const rd = await analyzeModel("prebuilt-read", bytes, mimeType);
    const m = mapLayoutRead(rd);
    if (!best || m.score > best.score) best = { model: "read", score: m.score, mapped: m.mapped, raw: rd };
  } catch (e) {
    // ignore
  }

  if (!best) throw new Error("Azure analysis failed across all models");
  return best;
}
