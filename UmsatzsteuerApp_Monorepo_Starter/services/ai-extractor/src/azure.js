// Platzhalter – ruft Azure nur auf, wenn Endpoint/Key gesetzt sind.
// Den echten Aufruf erweitern wir später (invoice/receipt/layout/read Sequenz).
export async function extractWithAzure(buffer, mimeType) {
  const endpoint = process.env.AZURE_ENDPOINT;
  const key = process.env.AZURE_KEY;
  const apiVersion = process.env.AZURE_API_VERSION || '2023-10-31';

  if (!endpoint || !key) {
    console.warn('[azure] Missing AZURE_ENDPOINT or AZURE_KEY – skipping call');
    return { model: 'azure-disabled', confidence: 0, raw: {} };
  }

  // TODO: echter Azure-Call – aktuell nur Dummy-Struktur
  return {
    model: 'azure:prebuilt-invoice',
    confidence: 0.0,
    raw: {}
  };
}
