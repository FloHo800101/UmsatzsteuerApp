import express from "express";
import cors from "cors";
import multer from "multer";
import { analyze } from "./src/azure.js";
import { mapFromModel } from "./src/mapping.js";

// Diagnostik für unbehandelte Fehler:
process.on("unhandledRejection", (r) => {
  console.error("[unhandledRejection]", r);
});
process.on("uncaughtException", (e) => {
  console.error("[uncaughtException]", e);
  // nicht sofort exit – Render restarts; wir wollen Logs sehen
});

console.log("[server] booting…");

const app = express();
app.use(cors({ origin: "*", methods: ["GET", "POST", "OPTIONS"] }));

app.get("/health", (_, res) => res.json({ ok: true }));

// Upload (im Speicher)
const maxMB = parseInt(process.env.MAX_FILE_MB || "25", 10);
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: maxMB * 1024 * 1024 },
});

const parseOrder = () =>
  (process.env.DI_MODEL_ORDER || "invoice,receipt,layout,read")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

const thresholds = {
  invoice: parseFloat(process.env.DI_THRESHOLD_INVOICE || "0.8"),
  receipt: parseFloat(process.env.DI_THRESHOLD_RECEIPT || "0.8"),
  layout: parseFloat(process.env.DI_THRESHOLD_LAYOUT || "0"),
  read: parseFloat(process.env.DI_THRESHOLD_READ || "0"),
};

const includeRaw =
  process.env.DI_DEBUG === "true" || process.env.NODE_ENV !== "production";

app.post("/extract", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) throw new Error("missing_file");

    const buffer = req.file.buffer;
    const contentType = req.file.mimetype || "application/octet-stream";
    const order = parseOrder();

    let lastResult = null;

    for (const model of order) {
      const { raw, confidence } = await analyze(model, buffer, contentType);
      const mapped = mapFromModel(model, raw, confidence);
      const score =
        typeof mapped?.confidence === "number" ? mapped.confidence : confidence || 0;

      lastResult = { model, score, mapped, raw };

      if (score >= (thresholds[model] ?? 0)) {
        return res.json({
          model,
          score,
          mapped,
          raw: includeRaw ? raw : undefined,
        });
      }
      // sonst: nächstes Modell probieren
    }

    // Nichts über Schwelle → letztes Ergebnis zurückgeben
    return res.json({
      ...lastResult,
      raw: includeRaw ? lastResult?.raw : undefined,
    });
  } catch (err) {
    console.error("[/extract] error:", err);
    const body =
      process.env.DI_DEBUG === "true"
        ? { error: "internal_error", detail: String(err?.message || err) }
        : { error: "internal_error" };
    res.status(500).json(body);
  }
});

const port = process.env.PORT || 8787;
app.listen(port, () => {
  console.log(`[server] ai-extractor listening on :${port}`);
});
