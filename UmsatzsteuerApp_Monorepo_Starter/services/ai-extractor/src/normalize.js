// services/ai-extractor/src/normalize.js

function round2(n) {
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 100) / 100;
}

function guessTaxRateFromTotals(subtotal, tax) {
  const s = Number(subtotal), t = Number(tax);
  if (Number.isFinite(s) && s > 0 && Number.isFinite(t) && t >= 0) {
    return round2((t / s) * 100);
  }
  return null;
}

function guessTaxRateFromItems(items) {
  if (!Array.isArray(items) || items.length === 0) return null;
  const rates = items.map(x => Number(x.taxRate)).filter(Number.isFinite);
  if (!rates.length) return null;
  // Nimm den am häufigsten vorkommenden Satz (Mode)
  const freq = new Map();
  for (const r of rates) freq.set(r, (freq.get(r) || 0) + 1);
  let best = null, bestC = -1;
  for (const [r, c] of freq) {
    if (c > bestC) { best = r; bestC = c; }
  }
  return round2(best);
}

export function normalizeForDb({ fileName, mimeType, xmlInfo, model, score, mapped, raw }) {
  const chart = process.env.DEFAULT_CHART_OF_ACCOUNTS || "SKR03";

  const subtotal = mapped?.subtotal ?? null;
  const tax = mapped?.tax ?? null;
  const items = Array.isArray(mapped?.items) ? mapped.items : [];

  // MWSt-Satz schätzen (erst Items, dann Totals)
  let taxRateGuess = guessTaxRateFromItems(items);
  if (taxRateGuess == null) taxRateGuess = guessTaxRateFromTotals(subtotal, tax);

  const normalized = {
    fileName,
    mimeType,
    model: model || null,
    score: score ?? null,
    source: mapped?.source || null,

    xmlType: xmlInfo?.xmlType || null,
    xmlVersion: xmlInfo?.xmlVersion || null,

    currency: mapped?.currency || "EUR",
    subtotal: subtotal ?? null,
    tax: tax ?? null,
    total: mapped?.total ?? null,

    vendorName: mapped?.vendorName || null,
    vendorVatId: mapped?.vendorVatId || null,
    buyerName: mapped?.buyerName || null,
    buyerVatId: mapped?.buyerVatId || null,

    invoiceNumber: mapped?.invoiceNumber || null,
    invoiceDate: mapped?.invoiceDate || null,
    dueDate: mapped?.dueDate || null,

    iban: mapped?.iban || null,
    bic: mapped?.bic || null,

    chartOfAccounts: chart,

    creditorName: mapped?.vendorName || null,
    debtorName: mapped?.buyerName || null,

    taxRateGuess,

    items,

    mappedJson: mapped || {},
    rawJson: raw || {}
  };

  return normalized;
}
