// services/ai-extractor/src/server.js
import express from "express";
import cors from "cors";
import multer from "multer";
import { fileURLToPath } from "node:url";
import path from "node:path";

import runMigrations from "./run-migrations.js";
import { detectEinvoiceFromBytes } from "./detectEinvoice.js";
import { normalizeForDb } from "./normalize.js";
import { persistReceipt } from "./persist.js";
import { extractWithAzure } from "./azure.js";
import { query } from "./db.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(cors());
app.use(express.json({ limit: "10mb" }));

// Multer im Speicher (wir speichern die Bytes in RAM und reichen sie an Azure/DB weiter)
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });

const PORT = Number(process.env.PORT || 8080);
const MODEL_CONFIDENCE_THRESHOLD = Number(process.env.MODEL_CONFIDENCE_THRESHOLD || "0.80");

// Health
app.get("/health", async (_req, res) => {
  res.json({ ok: true, service: "ai-extractor", ts: new Date().toISOString() });
});

// --- Feedback-Endpunkt (Korrekturen vom Frontend zurückschreiben) ---
app.post("/feedback", async (req, res) => {
  try {
    const { receiptId, patch, chartOfAccounts } = req.body || {};
    if (!receiptId) return res.status(400).json({ error: "receiptId missing" });

    if (patch && typeof patch === "object") {
      await query(
        `UPDATE receipts SET mapped_json = mapped_json || $1::jsonb WHERE id = $2`,
        [JSON.stringify(patch), receiptId]
      );
    }
    if (chartOfAccounts && typeof chartOfAccounts === "string") {
      await query(`UPDATE receipts SET chart_of_accounts = $1 WHERE id = $2`, [chartOfAccounts, receiptId]);
    }

    res.json({ ok: true });
  } catch (e) {
    console.error("feedback error:", e);
    res.status(500).json({ error: "feedback_failed", detail: e.message });
  }
});

// --- Haupt-Endpunkt: Datei analysieren & speichern ---
app.post("/extract", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "file_missing" });

    const bytes = req.file.buffer;
    const fileName = req.file.originalname || "upload";
    const mimeType = req.file.mimetype || "application/octet-stream";

    // 1) Einfache Heuristik für eRechnung (XRechnung / ZUGFeRD / Factur-X / UBL)
    const xmlInfo = detectEinvoiceFromBytes(fileName, mimeType, bytes);

    // 2) Azure-DI sequentiell (invoice -> receipt -> layout -> read)
    const az = await extractWithAzure({
      bytes,
      mimeType,
      threshold: MODEL_CONFIDENCE_THRESHOLD
    });
    // az: { model, score, mapped, raw }

    // 3) Normalisieren (inkl. xml-Metadaten)
    const normalized = normalizeForDb({
      fileName,
      mimeType,
      xmlInfo,
      model: az.model,
      score: az.score,
      mapped: az.mapped,
      raw: { azure: az.raw, xml: xmlInfo?.xmlRaw || null }
    });

    // 4) Persistieren (inkl. Items)
    const saved = await persistReceipt(normalized, bytes);

    res.json({
      ok: true,
      receiptId: saved.receiptId,
      model: normalized.model,
      score: normalized.score,
      chartOfAccounts: normalized.chartOfAccounts,
      xmlType: normalized.xmlType,
      totals: {
        currency: normalized.currency,
        subtotal: normalized.subtotal,
        tax: normalized.tax,
        total: normalized.total,
        taxRateGuess: normalized.taxRateGuess
      },
      parties: {
        creditorName: normalized.creditorName,
        debtorName: normalized.debtorName,
        vendorVatId: normalized.vendorVatId,
        buyerVatId: normalized.buyerVatId
      }
    });
  } catch (e) {
    console.error("extract error:", e);
    res.status(500).json({ error: "extract_failed", detail: e.message });
  }
});

// Einfache Detail-Ansicht (für Debug)
app.get("/receipts/:id", async (req, res) => {
  try {
    const { rows } = await query(`SELECT * FROM receipts WHERE id = $1`, [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: "not_found" });
    res.json(rows[0]);
  } catch (e) {
    console.error("get receipt error:", e);
    res.status(500).json({ error: "read_failed", detail: e.message });
  }
});

async function start() {
  try {
    if (String(process.env.RUN_MIGRATIONS || "").toLowerCase() === "true") {
      await runMigrations();
    }
    app.listen(PORT, () => {
      console.log(`ai-extractor listening on ${PORT}`);
    });
  } catch (e) {
    console.error("startup error:", e);
    process.exit(1);
  }
}

start();
