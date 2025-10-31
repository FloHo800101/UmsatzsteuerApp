// services/ai-extractor/lib/parseCII.js
import { XMLParser } from "fast-xml-parser";

// Hilfen, die unterschiedliche XML-Varianten robust lesen
const t = (v) => (typeof v === "string" ? v : v?.["#text"] ?? v?._text ?? null);
const num = (v) => {
  const s = t(v);
  if (s == null) return null;
  const n = Number(String(s).replace(",", "."));
  return Number.isFinite(n) ? n : null;
};
const attr = (node, name) => node?.[`@_${name}`] ?? null;

export function isCII(xmlString) {
  // Namespace-Präfixe variieren, deshalb simple Heuristik
  return /<\s*([a-zA-Z0-9]+:)?CrossIndustryInvoice\b/.test(xmlString);
}

export function parseCII(xmlString) {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "@_",
    removeNSPrefix: true, // macht aus rsm:CrossIndustryInvoice -> CrossIndustryInvoice
    allowBooleanAttributes: true,
  });

  const j = parser.parse(xmlString);

  const r = j?.CrossIndustryInvoice;
  if (!r) throw new Error("CII root element not found");

  // Datum
  const date =
    t(
      r?.ExchangedDocument?.IssueDateTime?.DateTimeString
    ) || null;

  // Lieferant
  const supplier =
    r?.SupplyChainTradeTransaction?.ApplicableHeaderTradeAgreement
      ?.SellerTradeParty?.Name ?? null;

  // Summen
  const sums =
    r?.SupplyChainTradeTransaction?.ApplicableHeaderTradeSettlement
      ?.SpecifiedTradeSettlementHeaderMonetarySummation ?? {};

  const netNode =
    sums?.TaxBasisTotalAmount ??
    sums?.LineTotalAmount ??
    null;
  const vatNode =
    sums?.TaxTotalAmount ?? null;
  const grossNode =
    sums?.GrandTotalAmount ??
    sums?.TaxInclusiveAmount ?? // manche Varianten
    null;

  const currency =
    attr(netNode, "currencyID") ||
    attr(grossNode, "currencyID") ||
    attr(vatNode, "currencyID") ||
    null;

  const normalized = {
    format: "cii",
    date,
    supplier: supplier ?? null,
    currency: currency ?? null,
    net: num(netNode),
    vat: num(vatNode),
    gross: num(grossNode),
  };

  return normalized;
}
