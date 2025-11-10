// services/ai-extractor/src/server.js
import express from "express";
import Busboy from "busboy";
import { persistReceipt } from "./persist.js";
import { detectEinvoiceFromBytes } from "./detectEinvoice.js";
import { normalizeForDb } from "./normalize.js";
import { execSync } from "node:child_process";
import { analyzeWithAzure } from "./azure.js";

const app = express();
app.use(express.json({ limit: "20mb" }));

app.get("/health", (_, res) => res.json({ ok: true }));

if (String(process.env.RUN_MIGRATIONS || "").toLowerCase() === "true") {
  try {
    execSync("node src/run-migrations.js", { stdio: "inherit" });
  } catch (e) {
    console.error("Migration error:", e.message);
  }
}

app.post("/extract", (req, res) => {
  const bb = Busboy({ headers: req.headers, limits: { files: 1, fileSize: 20 * 1024 * 1024 } });

  let fileName = null;
  let mimeType = null;
  const chunks = [];

  bb.on("file", (_, file, info) => {
    fileName = info.filename;
    mimeType = info.mimeType;
    file.on("data", (d) => chunks.push(d));
  });

  bb.on("finish", async () => {
    try {
      const fileBytes = Buffer.concat(chunks);

      // 1) Heuristik für eRechnung
      const xmlInfo = detectEinvoiceFromBytes(fileName, mimeType, fileBytes);

      // 2) Azure nur, wenn kein eRechnung-Hinweis
      let model = null, score = null, mapped = null, raw = null;
      if (xmlInfo.xmlType === "none") {
        const out = await analyzeWithAzure(fileBytes, fileName);
        model = out.model;
        score = out.score ?? null;
        mapped = out.mapped || {};
        raw = out.raw || out;
      } else {
        // Minimal: wir speichern die XML-Infos; echte Parser liefern wir als nächsten Schritt
        mapped = {
          vendorName: null,
          vendorVatId: null,
          buyerName: null,
          buyerVatId: null,
          invoiceNumber: null,
          invoiceDate: null,
          dueDate: null,
          currency: "EUR",
          subtotal: null,
          tax: null,
          total: null,
          items: [],
          confidence: 1.0,
          source: xmlInfo.xmlType
        };
        model = "einvoice";
        score = 1.0;
        raw = { xml: xmlInfo.xmlRaw, xmlType: xmlInfo.xmlType, xmlVersion: xmlInfo.xmlVersion };
      }

      // 3) Normalisieren & Speichern
      const normalized = normalizeForDb({
        fileName,
        mimeType,
        xmlInfo,
        model,
        score,
        mapped,
        raw
      });

      const { receiptId, fileSha256 } = await persistReceipt(normalized, fileBytes);

      res.json({
        model,
        score,
        mapped,
        raw,
        receipt_id: receiptId,
        file_sha256: fileSha256,
        db_status: "saved"
      });
    } catch (err) {
      console.error("extract failed:", err);
      res.status(500).json({ error: "internal_error", detail: String(err?.message || err) });
    }
  });

  req.pipe(bb);
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`ai-extractor listening on ${port}`));
