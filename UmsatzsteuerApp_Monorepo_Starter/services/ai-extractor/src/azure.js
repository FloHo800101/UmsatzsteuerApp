const ENDPOINT = process.env.AZURE_DI_ENDPOINT;
const KEY = process.env.AZURE_DI_KEY;
const API_VERSION = process.env.AZURE_DI_API_VERSION || "2024-11-30";

// Offizielle prebuilt-Model-IDs (v4.0):
//   prebuilt-invoice, prebuilt-receipt, prebuilt-layout, prebuilt-read
const MODEL_ID = {
  invoice: "prebuilt-invoice",
  receipt: "prebuilt-receipt",
  layout: "prebuilt-layout",
  read: "prebuilt-read"
};

function ensureEnv() {
  if (!ENDPOINT || !KEY) {
    throw new Error("AZURE_DI_ENDPOINT / AZURE_DI_KEY not set");
  }
}

function averageFieldConfidence(doc) {
  if (!doc?.fields) return 0.0;
  const values = Object.values(doc.fields);
  const confidences = values
    .map(v => v?.confidence)
    .filter(c => typeof c === "number");
  if (!confidences.length) return 0.0;
  return confidences.reduce((a, b) => a + b, 0) / confidences.length;
}

/**
 * v4.0 REST (synchron):
 *   POST {endpoint}/documentintelligence/documentModels/{modelId}:analyze
 *   ?_overload=analyzeDocument&api-version=YYYY-MM-DD
 * Body: { base64Source: "<...>" }  (alternativ: { urlSource: "<...>" })
 */
export async function analyzeWithAzure({ buffer, model }) {
  ensureEnv();
  const modelId = MODEL_ID[model];
  if (!modelId) return { raw: null, score: 0 };

  const url =
    `${ENDPOINT}/documentintelligence/documentModels/${modelId}:analyze` +
    `?_overload=analyzeDocument&api-version=${API_VERSION}`;

  const payload = { base64Source: buffer.toString("base64") };

  const resp = await fetch(url, {
    method: "POST",
    headers: {
      "Ocp-Apim-Subscription-Key": KEY,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    console.error("Azure analyze error", resp.status, text);
    return { raw: null, score: 0 };
  }

  const raw = await resp.json();

  // Scoring je Modell
  let score = 0;
  const firstDoc = raw?.documents?.[0];

  if ((model === "invoice" || model === "receipt") && firstDoc) {
    const fieldsAvg = averageFieldConfidence(firstDoc);
    const docConf = typeof firstDoc.confidence === "number" ? firstDoc.confidence : fieldsAvg;
    score = (fieldsAvg * 0.7) + (docConf * 0.3);
  } else if (model === "layout") {
    const hasTables = Array.isArray(raw?.tables) && raw.tables.length > 0;
    const hasParagraphs = Array.isArray(raw?.paragraphs) && raw.paragraphs.length > 0;
    score = (hasTables || hasParagraphs) ? 0.7 : 0.3;
  } else if (model === "read") {
    const text = typeof raw?.content === "string" ? raw.content : "";
    const lineCount = text.split("\n").length;
    score = lineCount > 50 ? 0.5 : 0.3;
  }

  return { raw, score };
}
