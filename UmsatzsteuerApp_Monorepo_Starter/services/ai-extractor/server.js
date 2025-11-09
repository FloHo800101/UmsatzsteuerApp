import express from "express";
import cors from "cors";
import multer from "multer";
import * as mapping from "./src/mapping.js";
import { analyze } from "./src/azure.js";

// Toleranter Zugriff: named export ODER default
const mapFromModel = mapping.mapFromModel ?? mapping.default;

// Robustere Logs
process.on("unhandledRejection", (r) => console.error("[unhandledRejection]", r));
process.on("uncaughtException", (e) => console.error("[uncaughtException]", e));

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
      const score = typeof mapped?.confidence === "number" ? mapped.confidence : (confidence || 0);

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

    // Nichts über Schwelle → letztes Ergebnis zurückgeben (zur Diagnose)
    return res.json({
      ...lastResu
