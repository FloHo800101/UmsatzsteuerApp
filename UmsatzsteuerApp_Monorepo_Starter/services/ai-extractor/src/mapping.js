export function mapFromModel(model, raw, fallbackConf = 0) {
  try {
    const ar = raw?.analyzeResult;

    if (model === "invoice") {
      const doc = ar?.documents?.[0];
      const f = doc?.fields || {};
      const items = extractArray(f.Items).map((v) => {
        const vf = fieldProps(v);
        return {
          description: pickText(vf.Description),
          quantity: pickNum(vf.Quantity),
          unitPrice: pickNum(vf.UnitPrice),
          amount: pickNum(vf.Amount),
          tax: pickNum(vf.Tax),
        };
      });
      return {
        type: "invoice",
        vendorName: pickText(f.VendorName),
        vendorVatId: pickText(f.VendorVatId) || pickText(f.VendorTaxId),
        invoiceNumber: pickText(f.InvoiceId) || pickText(f.InvoiceNumber),
        invoiceDate: pickText(f.InvoiceDate),
        dueDate: pickText(f.DueDate),
        currency: pickText(f.Currency),
        subtotal: pickNum(f.Subtotal),
        tax: pickNum(f.TotalTax),
        total: pickNum(f.TotalAmount) ?? pickNum(f.AmountDue),
        items,
        confidence: typeof doc?.confidence === "number" ? doc.confidence : fallbackConf,
        source: "prebuilt-invoice",
      };
    }

    if (model === "receipt") {
      const doc = ar?.documents?.[0];
      const f = doc?.fields || {};
      const items = extractArray(f.Items).map((v) => {
        const vf = fieldProps(v);
        return {
          description: pickText(vf.Description),
          quantity: pickNum(vf.Quantity),
          unitPrice: pickNum(vf.UnitPrice),
          totalPrice: pickNum(vf.TotalPrice),
        };
      });
      return {
        type: "receipt",
        merchantName: pickText(f.MerchantName),
        transactionDate: pickText(f.TransactionDate),
        transactionTime: pickText(f.TransactionTime),
        currency: pickText(f.Currency),
        subtotal: pickNum(f.Subtotal),
        tax: pickNum(f.TotalTax),
        tip: pickNum(f.Tip),
        total: pickNum(f.Total),
        items,
        confidence: typeof doc?.confidence === "number" ? doc.confidence : fallbackConf,
        source: "prebuilt-receipt",
      };
    }

    if (model === "layout") {
      return {
        type: "layout",
        pages: ar?.pages?.length || 0,
        tables: ar?.tables?.length || 0,
        paragraphs: ar?.paragraphs?.length || 0,
        contentPreview: ar?.content ? String(ar.content).slice(0, 400) : null,
        source: "prebuilt-layout",
        confidence: fallbackConf,
      };
    }

    if (model === "read") {
      return {
        type: "read",
        contentPreview: ar?.content ? String(ar.content).slice(0, 400) : null,
        source: "prebuilt-read",
        confidence: fallbackConf,
      };
    }
  } catch {
    // Fallback unten
  }
  return { type: model, contentPreview: null, source: "unknown", confidence: fallbackConf };
}

// Helpers
function extractArray(node) {
  if (!node) return [];
  if (Array.isArray(node.values)) return node.values;
  if (Array.isArray(node?.valueArray)) return node.valueArray;
  return [];
}
function fieldProps(v) { return v?.properties || v?.fields || {}; }
function pickText(f) {
  if (!f) return null;
  if (typeof f.content === "string") return f.content;
  if (typeof f.valueString === "string") return f.valueString;
  if (typeof f.valueDate === "string") return f.valueDate;
  if (typeof f.valueCurrency === "string") return f.valueCurrency;
  if ("value" in f && f.value != null) return String(f.value);
  return null;
}
function pickNum(f) {
  if (!f) return null;
  if (typeof f.valueNumber === "number") return f.valueNumber;
  if (f?.valueCurrency && typeof f.valueCurrency.amount === "number") return f.valueCurrency.amount;
  if (typeof f.value === "number") return f.value;
  return null;
}
