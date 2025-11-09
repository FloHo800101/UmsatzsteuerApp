/**
 * Vereinheitlicht Azure-Antworten auf unser App-Schema.
 * Erweiterbar (KZ/SKR, VAT-Sätze, Reverse-Charge, ...).
 */
export function mapToInternal({ model, raw }) {
  const doc = raw?.documents?.[0];

  if (model === "invoice" && doc?.fields) {
    const f = doc.fields;
    return {
      type: "invoice",
      vendorName: f.VendorName?.value ?? null,
      vendorVatId: f.VendorVatId?.value ?? null,
      invoiceNumber: f.InvoiceId?.value ?? null,
      invoiceDate: f.InvoiceDate?.value ?? null,
      dueDate: f.DueDate?.value ?? null,
      currency: f.Currency?.value ?? null,
      subtotal: f.SubTotal?.value ?? null,
      tax: f.TotalTax?.value ?? null,
      total: f.InvoiceTotal?.value ?? f.AmountDue?.value ?? null,
      items: (f.Items?.value ?? []).map(i => ({
        description: i?.value?.Description?.value ?? null,
        quantity: i?.value?.Quantity?.value ?? null,
        unit: i?.value?.Unit?.value ?? null,
        unitPrice: i?.value?.UnitPrice?.value ?? null,
        productCode: i?.value?.ProductCode?.value ?? null,
        amount: i?.value?.Amount?.value ?? null,
        tax: i?.value?.Tax?.value ?? null
      })),
      confidence: typeof doc.confidence === "number" ? doc.confidence : null,
      source: "prebuilt-invoice"
    };
  }

  if (model === "receipt" && doc?.fields) {
    const f = doc.fields;
    return {
      type: "receipt",
      merchantName: f.MerchantName?.value ?? null,
      transactionDate: f.TransactionDate?.value ?? null,
      transactionTime: f.TransactionTime?.value ?? null,
      currency: f.Currency?.value ?? null,
      subtotal: f.Subtotal?.value ?? null,
      tax: f.TotalTax?.value ?? f.Tax?.value ?? null,
      tip: f.Tip?.value ?? null,
      total: f.Total?.value ?? null,
      items: (f.Items?.value ?? []).map(i => ({
        description: i?.value?.Description?.value ?? null,
        quantity: i?.value?.Quantity?.value ?? null,
        unitPrice: i?.value?.Price?.value ?? i?.value?.UnitPrice?.value ?? null,
        totalPrice: i?.value?.TotalPrice?.value ?? null
      })),
      confidence: typeof doc.confidence === "number" ? doc.confidence : null,
      source: "prebuilt-receipt"
    };
  }

  if (model === "layout") {
    return {
      type: "layout",
      pages: Array.isArray(raw?.pages) ? raw.pages.length : 0,
      tables: Array.isArray(raw?.tables) ? raw.tables.length : 0,
      paragraphs: Array.isArray(raw?.paragraphs) ? raw.paragraphs.length : 0,
      contentPreview: typeof raw?.content === "string" ? raw.content.slice(0, 2000) : null,
      source: "prebuilt-layout"
    };
  }

  // read / fallback
  return {
    type: "read",
    contentPreview: typeof raw?.content === "string" ? raw.content.slice(0, 2000) : null,
    source: "prebuilt-read"
  };
}
