import axios from "axios";

const endpoint = process.env.AZURE_ENDPOINT;
const apiKey = process.env.AZURE_KEY;
const apiVersion = process.env.AZURE_API_VERSION || "2024-02-29-preview";

function opHeaders() {
  return {
    "Ocp-Apim-Subscription-Key": apiKey
  };
}

async function analyzeWithModel(modelId, fileBuffer, mime) {
  const url = `${endpoint}/documentintelligence/documentModels/${modelId}:analyze?api-version=${apiVersion}&stringIndexType=textElements`;
  const postRes = await axios.post(url, fileBuffer, {
    headers: {
      ...opHeaders(),
      "Content-Type": mime || "application/pdf"
    },
    maxBodyLength: Infinity
  });
  const operationLocation = postRes.headers["operation-location"];
  if (!operationLocation) {
    throw new Error("Azure analyze: missing operation-location header");
  }

  // Poll result
  let status = "running";
  let result = null;
  const start = Date.now();
  while (status === "running" || status === "notStarted") {
    await new Promise(r => setTimeout(r, 1000));
    const getRes = await axios.get(operationLocation, { headers: opHeaders() });
    status = getRes.data.status;
    if (status === "succeeded") {
      result = getRes.data;
      break;
    }
    if (status === "failed") {
      throw new Error("Azure analyze failed");
    }
    // Safety timeout 60s
    if (Date.now() - start > 60000) {
      throw new Error("Azure analyze timed out");
    }
  }
  return result;
}

/**
 * Sequenzieller Flow:
 * 1) prebuilt-invoice
 * 2) prebuilt-receipt
 * 3) layout
 * 4) read (OCR)
 * Frühzeitiger Exit, wenn Konfidenz >= MODEL_CONFIDENCE_THRESHOLD.
 */
export async function analyzeSequential(fileBuffer, mime) {
  const threshold =
    parseFloat(process.env.MODEL_CONFIDENCE_THRESHOLD || "0.80");

  // 1) Invoice
  try {
    const invoice = await analyzeWithModel("prebuilt-invoice", fileBuffer, mime);
    return { model: "prebuilt-invoice", result: invoice };
  } catch {}

  // 2) Receipt
  try {
    const receipt = await analyzeWithModel("prebuilt-receipt", fileBuffer, mime);
    return { model: "prebuilt-receipt", result: receipt };
  } catch {}

  // 3) Layout
  try {
    const layout = await analyzeWithModel("prebuilt-layout", fileBuffer, mime);
    return { model: "prebuilt-layout", result: layout };
  } catch {}

  // 4) Read (OCR)
  const read = await analyzeWithModel("prebuilt-read", fileBuffer, mime);
  return { model: "prebuilt-read", result: read };
}
