import express from "express";
import multer from "multer";
import { analyzeWithAzure } from "./src/azure.js";
import { mapToInternal } from "./src/mapping.js";

const app = express();
const upload = multer({ limits: { fileSize: 25 * 1024 * 1024 } });
const PORT = process.env.PORT || 8787;

// CORS simpel für DEV (für PROD: Origin einschränken)
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Allow-Methods", "POST, GET, OPTIONS");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

app.get("/health", (_req, res) => res.json({ ok: true }));

app.post("/extract", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "file_missing" });

    const modelOrder = (process.env.DI_MODEL_ORDER || "invoice,receipt,layout,read")
      .split(",")
      .map(s => s.trim().toLowerCase())
      .filter(Boolean);

    const thresholds = {
      invoice: Number(process.env.DI_THRESHOLD_INVOICE ?? 0.8),
      receipt: Number(process.env.DI_THRESHOLD_RECEIPT ?? 0.8),
      layout: Number(process.env.DI_THRESHOLD_LAYOUT ?? 0.65),
      read: Number(process.env.DI_THRESHOLD_READ ?? 0.0)
    };

    let best = null;

    for (const model of modelOrder) {
      const { raw, score } = await analyzeWithAzure({
        buffer: req.file.buffer,
        model
      });

      if (!raw) continue;

      const mapped = mapToInternal({ model, raw });
      best = { model, score, mapped, raw };

      // Early-Exit wenn Schwelle erreicht
      if (score >= (thresholds[model] ?? 1)) break;
    }

    if (!best) return res.status(422).json({ error: "no_result" });

    res.json({
      model: best.model,
      score: best.score,
      mapped: best.mapped,
      raw: best.raw // in PROD ggf. weglassen
    });
  } catch (err) {
    console.error("extract error", err);
    res.status(500).json({ error: "internal_error" });
  }
});

app.listen(PORT, () => {
  console.log(`ai-extractor listening on :${PORT}`);
});
