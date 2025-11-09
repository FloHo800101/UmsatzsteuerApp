// Azure Document Intelligence – robuster Client mit Pfad- & Versions-Fallback
const endpointRaw = process.env.AZURE_DI_ENDPOINT || "";
const endpoint = endpointRaw.replace(/\/+$/, ""); // ohne trailing slash
const key = process.env.AZURE_DI_KEY || "";
const envVersion = (process.env.AZURE_DI_API_VERSION || "").trim();
const DEBUG = process.env.DI_DEBUG === "true";

if (!endpoint || !key) {
  // Laufzeitfehler ist ok – wird sauber als detail zurückgegeben
  // (server.js fängt es ab)
}

/** Kurz-Namen → Modell-IDs */
const MODEL_IDS = {
  invoice: "prebuilt-invoice",
  receipt: "prebuilt-receipt",
  layout: "prebuilt-layout",
  read: "prebuilt-read",
};

/** Reihenfolge: erst ENV, dann bekannte stabile/preview */
const VERSIONS = dedup([
  envVersion,
  "2024-02-29-preview",
  "2023-10-31",
  "2023-07-31",
]).filter(Boolean);

/** Zwei mögliche Basis-Pfade (neu vs. älter) */
const BASES = [
  "/documentintelligence/documentModels",
  "/formrecognizer/documentModels",
];

/**
 * Startet Analyse und pollt bis Ergebnis vorliegt.
 * @param {"invoice"|"receipt"|"layout"|"read"|string} model
 * @param {Uint8Array|Buffer} buffer
 * @param {string} _contentType
 * @returns {Promise<{raw:any, confidence:number}>}
 */
export async function analyze(
  model,
  buffer,
  _contentType = "application/octet-stream"
) {
  if (!endpoint || !key) {
    throw new Error("missing_azure_config (AZURE_DI_ENDPOINT/AZURE_DI_KEY)");
  }

  const modelId = MODEL_IDS[model] || model;
  const tried = [];
  const versions = VERSIONS.length ? VERSIONS : ["2023-10-31", "2024-02-29-preview"];

  // 1) Analyse anstoßen – wir testen Pfad×Version, bis 202 kommt
  for (const base of BASES) {
    for (const ver of versions) {
      const url = `${endpoint}${base}/${encodeURIComponent(
        modelId
      )}:analyze?api-version=${encodeURIComponent(ver)}`;

      const r = await fetch(url, {
        method: "POST",
        headers: {
          "Ocp-Apim-Subscription-Key": key,
          "Content-Type": "application/octet-stream",
          Accept: "application/json",
        },
        body: buffer,
      });

      if (r.status === 202) {
        const opLoc =
          r.headers.get("operation-location") ||
          r.headers.get("Operation-Location");
        if (!opLoc) throw new Error("missing operation-location header");
        if (DEBUG) console.log(`[analyze] 202 via ${base} @ ${ver}`);
        // 2) Polling mit passender Kombi
        return await poll(opLoc, modelId);
      }

      const btxt = await safeText(r);
      tried.push(`${base} @ ${ver} -> HTTP ${r.status} ${shorten(btxt)}`);
      if (DEBUG) console.log(`[analyze] ${base} @ ${ver}: HTTP ${r.status}`);
      // Bei 404/400/401/403 probieren wir die nächste Kombi weiter
    }
  }

  // Keine Kombi erfolgreich
  throw new Error(`analyze ${modelId} failed: tried ${tried.join(" | ")}`);
}

/** Polling der Operation-Location bis succeeded/failed/timeout */
async function poll(opLoc, modelId) {
  const started = Date.now();
  while (true) {
    await wait(1200);

    const g = await fetch(opLoc, {
      headers: {
        "Ocp-Apim-Subscription-Key": key,
        Accept: "application/json",
      },
    });

    // Noch busy
    if (g.status === 202 || g.status === 204) {
      if (DEBUG) console.log(`[poll ${modelId}] ${g.status} (processing)`);
      continue;
    }

    const txt = await safeText(g);
    if (!txt || !txt.trim()) {
      if (DEBUG) console.log(`[poll ${modelId}] empty body → continue`);
      continue;
    }

    let data;
    try {
      data = JSON.parse(txt);
    } catch {
      if (DEBUG) console.log(`[poll ${modelId}] bad json → continue`);
      continue;
    }

    const status = data.status || data?.analyzeResult?.status;
    if (status === "succeeded") {
      const confidence = pickConfidence(data);
      if (DEBUG)
        console.log(
          `[poll ${modelId}] succeeded (conf=${
            typeof confidence === "number" ? confidence.toFixed(2) : "?"
          })`
        );
      return { raw: data, confidence };
    }

    if (status === "failed") {
      throw new Error(
        `analysis failed for ${modelId}: ${JSON.stringify(
          data?.errors || data
        )}`
      );
    }

    if (DEBUG) console.log(`[poll ${modelId}] status=${status || "unknown"}`);
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

function shorten(s, n = 160) {
  if (!s) return "";
  s = String(s);
  return s.length > n ? s.slice(0, n) + "…" : s;
}

function dedup(arr) {
  const out = [];
  for (const v of arr) {
    if (v && !out.includes(v)) out.push(v);
  }
  return out;
}

function pickConfidence(data) {
  try {
    const doc = data?.analyzeResult?.documents?.[0];
    if (typeof doc?.confidence === "number") return doc.confidence;

    const fields = doc?.fields || {};
    const vals = Object.values(fields)
      .map((f) => (typeof f?.confidence === "number" ? f.confidence : null))
      .filter((n) => typeof n === "number");
    if (vals.length) return vals.reduce((a, b) => a + b, 0) / vals.length;

    // Layout/Read ohne Field-Confidences
    return 0.5;
  } catch {
    return 0.0;
  }
}
