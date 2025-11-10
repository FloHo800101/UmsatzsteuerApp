import "dotenv/config";
import express from "express";
import multer from "multer";
import crypto from "crypto";
import { analyzeSequential } from "./azure.js";
import { mapFromAzure } from "./map.js";
import { insertDocumentWithDetails, pool } from "./db.js";

const app = express();
app.use(express.json({ limit: "20mb" }));

const upload = multer({ storage: multer.memoryStorage() });

app.get("/health", async (_req, res) => {
  try {
    await pool.query("select 1");
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

/**
 * POST /extract?persist=true
 * FormData:
 *  - file: (PDF/JPG/PNG)
 * Optional JSON body fields (falls Frontend sie mitsendet) werden zurzeit ignoriert.
 */
app.post("/extract", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "missing file" });
    }

    const buf = req.file.buffer;
    const mime = req.file.mimetype || "application/pdf";
    const filename = req.file.originalname;
    const fileSize = req.file.size;
    const fileSha256 = crypto.createHash("sha256").update(buf).digest("hex");

    // 1) Azure DI
    const { model, result } = await analyzeSequential(buf, mime);

    // 2) Mapping
    const { mapped, items, taxes, modelConfidence } = mapFromAzure(
      model,
      result,
      { defaultChart: process.env.DEFAULT_CHART_OF_ACCOUNTS || "SKR03" }
    );

    const persist =
      String(req.query.persist || "true").toLowerCase() !== "false";

    let documentId = null;

    if (persist) {
      // 3) Persistenz
      documentId = await insertDocumentWithDetails({
        meta: {
          filename,
          fileMime: mime,
          fileSize,
          fileSha256,
          sourceModel: model,
          modelConfidence: modelConfidence != null ? Number(modelConfidence) : null
        },
        mapped,
        raw: result,
        items,
        taxes,
        fileBytes: buf
      });
    }

    return res.json({
      ok: true,
      docId: documentId,
      model,
      modelConfidence,
      mapped,
      items,
      taxes,
      raw: result
    });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

/**
 * GET /documents/:id
 * Einfacher Reader für das Frontend (z. B. Preview/Details)
 */
app.get("/documents/:id", async (req, res) => {
  const { id } = req.params;
  try {
    const doc = await pool.query("select * from documents where id = $1", [id]);
    if (!doc.rows.length) return res.status(404).json({ error: "not found" });
    const items = await pool.query(
      "select * from document_items where document_id = $1 order by line_no asc",
      [id]
    );
    const taxes = await pool.query(
      "select * from document_taxes where document_id = $1",
      [id]
    );
    res.json({
      document: doc.rows[0],
      items: items.rows,
      taxes: taxes.rows
    });
  } catch (e) {
    res.status(500).json({ error: String(e?.message || e) });
  }
});

const port = Number(process.env.PORT || 8080);
app.listen(port, () => {
  console.log(`ai-extractor listening on :${port}`);
});
