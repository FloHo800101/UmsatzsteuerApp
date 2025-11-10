// Sehr schlanke Normalisierung – erweitert man später feldweise

export function mapFromAzure(raw) {
  // Azure prebuilt-invoice/receipt Struktur (vereinfacht)
  const doc = raw?.documents?.[0] ?? {};
  const fields = doc?.fields ?? {};

  const getVal = (f) => f?.content ?? f?.value ?? null;

  const supplier = {
    name: getVal(fields?.VendorName),
    taxId: getVal(fields?.VendorTaxId),
  };
  const customer = {
    name: getVal(fields?.CustomerName),
    taxId: getVal(fields?.CustomerTaxId),
  };

  return {
    chartOfAccounts: 'SKR03',
    creditor: supplier,
    debtor: customer,
    invoiceNumber: getVal(fields?.InvoiceId),
    invoiceDate: getVal(fields?.InvoiceDate),
    currency: doc?.fields?.Currency?.value ?? raw?.locale ?? null,
    subtotal: Number(getVal(fields?.Subtotal)) || null,
    taxAmount: Number(getVal(fields?.TotalTax)) || null,
    taxRate: Number(fields?.TaxRate?.value) || null,
    totalAmount: Number(getVal(fields?.Total)) || null,
    iban: getVal(fields?.VendorIBAN),
    bic: null,
    vatCountryCode: null,
    lines: Array.isArray(fields?.Items?.valueArray)
      ? fields.Items.valueArray.map((it, idx) => ({
          lineNo: idx + 1,
          description: getVal(it?.valueObject?.Description),
          quantity: Number(getVal(it?.valueObject?.Quantity)) || null,
          unitPrice: Number(getVal(it?.valueObject?.UnitPrice)) || null,
          netAmount: Number(getVal(it?.valueObject?.Amount)) || null,
          taxRate: Number(getVal(it?.valueObject?.TaxRate)) || null,
          taxAmount: null,
          accountCode: null,
          vatCode: null
        }))
      : []
  };
}

export function mapFromEinvoice(raw) {
  // Minimaler XRechnung/ZUGFeRD-Mapper – kann später verfeinert werden
  const r = raw || {};
  const txt = JSON.stringify(r);

  const find = (paths) => {
    for (const p of paths) {
      const parts = p.split('.');
      let cur = r;
      for (const part of parts) {
        cur = cur?.[part];
        if (cur === undefined) break;
      }
      if (cur !== undefined) return cur;
    }
    return null;
  };

  const creditorName =
    find(['rsm:CrossIndustryInvoice.ram:SupplyChainTradeTransaction.ram:ApplicableHeaderTradeAgreement.ram:SellerTradeParty.ram:Name']) ||
    find(['SellerTradeParty.Name']);
  const debtorName =
    find(['rsm:CrossIndustryInvoice.ram:SupplyChainTradeTransaction.ram:ApplicableHeaderTradeAgreement.ram:BuyerTradeParty.ram:Name']) ||
    find(['BuyerTradeParty.Name']);

  const invNo =
    find(['rsm:CrossIndustryInvoice.ram:ExchangedDocument.ram:ID']) ||
    find(['ExchangedDocument.ID']);

  const invDate =
    find(['rsm:CrossIndustryInvoice.ram:ExchangedDocument.ram:IssueDateTime.ram:DateTimeString']) ||
    find(['ExchangedDocument.IssueDateTime.DateTimeString']);

  const total = Number(
    find(['...GrandTotalAmount', 'rsm:CrossIndustryInvoice.ram:SupplyChainTradeTransaction.ram:ApplicableHeaderTradeSettlement.ram:MonetarySummation.ram:GrandTotalAmount', 'MonetarySummation.GrandTotalAmount'])
  ) || null;

  const taxTotal = Number(
    find(['...TaxTotalAmount', 'MonetarySummation.TaxTotalAmount'])
  ) || null;

  const netTotal = Number(
    find(['...LineTotalAmount', 'MonetarySummation.LineTotalAmount'])
  ) || null;

  return {
    chartOfAccounts: 'SKR03',
    creditor: { name: creditorName, taxId: null },
    debtor:   { name: debtorName,   taxId: null },
    invoiceNumber: invNo,
    invoiceDate: invDate,
    currency: null,
    subtotal: netTotal,
    taxAmount: taxTotal,
    taxRate: null,
    totalAmount: total,
    iban: null,
    bic: null,
    vatCountryCode: null,
    lines: []
  };
}

// Alias wie besprochen (mapFromModel -> mapFromAzure)
export const mapFromModel = mapFromAzure;
export default mapFromAzure;
