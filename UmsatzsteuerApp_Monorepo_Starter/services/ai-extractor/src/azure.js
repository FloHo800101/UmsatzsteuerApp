// Azure Document Intelligence robust: probiert Pfade + API-Versionen automatisch
const endpointRaw = process.env.AZURE_DI_ENDPOINT || "";
const endpoint = endpointRaw.replace(/\/+$/, ""); // ohne trailing slash
const key = process.env.AZURE_DI_KEY || "";
const envVersion = (process.env.AZURE_DI_API_VERSION || "").trim();
const DEBUG = process.env.DI_DEBUG === "true";

if (!endpoint || !key) {
  throw new Error("missing_azure_config (AZURE_DI_ENDPOINT/AZURE_DI_KEY)");
}

// Kurz-Namen → Modell-IDs
const MODEL_IDS = {
  invoice: "prebuilt-invoice",
  receipt: "prebuilt-receipt",
  layout: "prebuilt-layout",
  read: "prebuilt-read",
};

// Reihenfolge: zuerst env, dann stabile+preview Varianten
const VERSIONS = dedup([envVersion, "2024-02-29-preview", "2023-10-31", "2023-07-31"]).filter(Boolean);
// Zwei mögliche Basis-Pfade (neu vs. älter)
const BASES = ["/documentintelligence/documentModels", "/formrecognizer/documentModels"];

export async function analyze(model, buffer, _contentType = "application/octet-stream") {
  const modelId = MODEL_IDS[model] || model;
  const tried = [];

  // 1) Analyse starten – wir testen Kombinationen, bis 202 kommt
  let opLoc = null;
  for (const base of BASES) {
    for (const ver of VERSIONS) {
      const url = `${endpoint}${base}/${modelId}:analyze?api-version=${encodeURIComponent(ver)}`;
      const r = await fetch(url, {
        method: "POST",
        headers: {
          "Ocp-Apim-Subscription-Key": key,
          "Content-Type": "application/octet-stream",
          "Accept": "application/json",
        },
        body: buffer,
      });

      if (r.status === 202) {
        opLoc = r.headers.get("operation-location") || r.headers.get("Operation-Location");
        if (!opLoc) throw new Error("missing operation-location header");
        if (DEBUG) console.log(`[analyze] OK 202 via ${base} @ ${ver}`);
        // 2) Polling mit genau dieser Kombi
        return await poll(opLoc, ver, modelId);
      }

      const btxt = await safeText(r);
      tried.push(`${base} @ ${ver} -> HTTP ${r.status} ${shorten(btxt)}`);

      // 404 = falscher Pfad/Version → nächste Kombi probieren
      if (r.status === 404) {
        if (DEBUG) console.log(`[analyze] 404 on ${base} @ ${ver} → try next`);
        continue;
      }
      // andere Fehler: merken, aber weiterprobieren (z. B. 400/401/403)
      if (DEBUG) console.log(`[analyze] ${r.status} on ${base} @ ${ver}: ${shorten(btxt)}`);
    }
  }

  // Keine Kombi erfolgreich
  throw new Error(`analyze ${modelId} failed: tried ${tried.join(" | ")}`);
}

async function poll(opLoc, _ver, modelId) {
  const started = Date.now();
  while (true) {
    await wait(1200);
    const g = await fetch(opLoc, {
      headers: {
        "Ocp-Apim-Subscription-Key": key,
        "Accept": "application/json",
      },
    });

    // 202/204 → noch busy
    if (g.status === 202 || g.status === 204) {
      if (DEBUG) console.log(`[poll ${modelId}] HTTP ${g.status} (processing)`);
