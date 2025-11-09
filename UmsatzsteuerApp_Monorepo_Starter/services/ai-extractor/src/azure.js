// Robust Azure Document Intelligence v4 REST-Client (defensives Polling)
const endpointRaw = process.env.AZURE_DI_ENDPOINT || "";
const endpoint = endpointRaw.replace(/\/+$/, ""); // ohne trailing slash
const key = process.env.AZURE_DI_KEY || "";
const apiVersion = process.env.AZURE_DI_API_VERSION || "2023-10-31";
const DEBUG = process.env.DI_DEBUG === "true";

/**
 * Kurz-Namen → Modell-IDs
 * POST {endpoint}/documentintelligence/documentModels/{modelId}:analyze?api-version=...
 */
const MODEL_IDS = {
  invoice: "prebuilt-invoice",
  receipt: "prebuilt-receipt",
  layout: "prebuilt-layout",
  read: "prebuilt-read",
};

export async function analyze(model, buffer, _contentType = "application/octet-stream") {
  if (!endpoint || !key) {
    throw new Error("missing_azure_config (AZURE_DI_ENDPOINT/AZURE_DI_KEY)");
  }

  const modelId = MODEL_IDS[model] || model;
  const url = `${endpoint}/documentintelligence/documentModels/${modelId}:analyze?api-version=${encodeURIComponent(apiVersion)}`;

  // 1) Analyse starten
  const r = await fetch(url, {
    method: "POST",
    headers: {
      "Ocp-Apim-Subscription-Key": key,
      "Content-Type": "application/octet-stream",
      "Accept": "application/json",
    },
    body: buffer,
  });

  // Erwartet 202 + Operation-Location
  if (r.status !== 202) {
    const txt = await safeText(r);
    throw new Error(`analyze ${modelId} failed: HTTP ${r.status} ${txt}`);
  }
  const opLoc =
    r.headers.get("operation-location") ||
    r.headers.get("Operation-Location") ||
    null;
  if (!opLoc) throw new Error("missing operation-location header");

  // 2) Polling bis succeeded/failed/timeout
  const started = Date.now();
  while (true) {
    await wait(1200);

    const g = await fetch(opLoc, {
      headers: {
        "Ocp-Apim-Subscription-Key": key,
        "Accept": "application/json",
      },
    });

    // 202/204 → noch nicht fertig
    if (g.status === 202 || g.status === 204) {
      if (DEBUG) console.log(`[poll ${modelId}] HTTP ${g.status} (processing)`);
      continue;
    }

    // Manche Zwischenzustände liefern 200, aber ohne Body → leer = weiter pollen
    const txt = await safeText(g);
    if (!txt || !txt.trim()) {
      if (DEBUG) console.log(`[poll ${modelId}] HTTP ${g.status} empty body → continue`);
      continue;
    }

    let data;
    try {
      data = JSON.parse(txt);
    } catch (e) {
      if (DEBUG) console.log(`[poll ${modelId}] JSON parse failed → continue`);
      continue; // weiter pollen statt crashen
    }

    const status = data.status || data?.analyzeResult?.status;
    if (status === "succeeded") {
      const confidence = pickConfidence(data);
      if (DEBUG) console.log(`[poll ${modelId}] succeeded (conf=${confidence?.toFixed?.(2) ?? "?"})`);
      return { raw: data, confidence };
    }
    if (status === "failed") {
      throw new Error(
        `analysis failed for ${modelId}: ` + JSON.stringify(data?.errors || data)
      );
    }

    // running/notStarted → weiter pollen
    if (DEBUG) console.log(`[poll ${modelId}] status=${status || "unknown"} → continue`);

    if (Date.now() - started > 60000) {
      throw new Error(`timeout waiting for analysis (${modelId})`);
    }
  }
}

// --- helpers ---
function wait(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function safeText(res) {
  try {
    return await res.text();
  } catch {
    return "";
  }
}

function pickConfidence(data) {
  try {
    const doc = data?.analyzeResult?.documents?.[0];
    if (typeof doc?.confidence === "number") return doc.confidence;

    // Fallback: Mittel der Field-Confidences (falls vorhanden)
    const fields = doc?.fields || {};
    const vals = Object.values(fields)
      .map((f) => (typeof f?.confidence === "number" ? f.confidence : 0.5))
      .filter((n) => !Number.isNaN(n));
    if (vals.length) return vals.reduce((a, b) => a + b, 0) / vals.length;

    // Layout/Read ohne Confidences → neutral
    return 0.5;
  } catch {
    return 0.0;
  }
}
