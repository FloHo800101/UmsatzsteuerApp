import express from "express";
import cors from "cors";
import morgan from "morgan";
import { nanoid } from "nanoid";
import pg from "pg";
import { XMLParser } from "fast-xml-parser";

const { Pool } = pg;

const PORT = process.env.PORT || 8787;
const DATABASE_URL = process.env.DATABASE_URL || "";
const ORIGINS = (process.env.CORS_ORIGIN || "https://floho800101.github.io,http://localhost:8080")
  .split(",").map(s => s.trim()).filter(Boolean);

// ── DB ─────────────────────────────────────────────────────────────
const pool = new Pool({ connectionString: DATABASE_URL || undefined });
async function initDb() {
  await pool.query(`
    create table if not exists receipts (
      id text primary key,
      created_at timestamptz not null default now(),
      tenant_id text,
      user_id text,
      file_name text not null,
      mime text,
      raw_text text,
      fields jsonb,
      route text,           -- "xml" | "needs_ocr"
      last_request_id text
    );
  `);
  await pool.query(`
    create table if not exists feedback_events (
      id text primary key,
      created_at timestamptz not null default now(),
      request_id text,
      file_name text not null,
      verdict text not null check (verdict in ('accepted','corrected')),
      original jsonb not null,
      corrected jsonb
    );
  `);
}
await initDb();

// ── Helpers: XML → JSON (Namespaces robust entfernen) ─────────────
const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@",
  removeNSPrefix: true,   // <cbc:IssueDate> → IssueDate
  allowBooleanAttributes: true
});

function normalizeFromUbl(u) {
  // Versuche Standardschlüssel ohne Namespace
  const inv = u.Invoice || u;
  const get = (...keys) => keys.find(k => k in inv) ? inv[keys.find(k => k in inv)] : undefined;

  const issueDate =
    inv?.IssueDate || inv?.IssueTime || inv?.InvoiceDate || null;

  // Beträge
  const monetary = inv?.LegalMonetaryTotal || {};
  const payable = monetary?.PayableAmount;
  const lineExt = monetary?.LineExtensionAmount;
  const taxTotal = (inv?.TaxTotal?.TaxAmount) ?? null;

  const currency =
    (typeof payable === "object" && payable?.["@currencyID"]) ||
    (typeof lineExt === "object" && lineExt?.["@currencyID"]) ||
    (typeof taxTotal === "object" && taxTotal?.["@currencyID"]) || null;

  const payableVal = typeof payable === "object" ? payable?.["#text"] || payable?.["@value"] : payable;
  const lineExtVal = typeof lineExt === "object" ? lineExt?.["#text"] || lineExt?.["@value"] : lineExt;
  const taxVal = typeof taxTotal === "object" ? taxTotal?.["#text"] || taxTotal?.["@value"] : taxTotal;

  // Lieferant
  const sup =
    inv?.AccountingSupplierParty?.Party?.PartyName?.Name ||
    inv?.AccountingSupplierParty?.Party?.Name || null;

  // Netto grob ableiten (wenn nicht gegeben)
  let gross = payableVal != null ? Number(payableVal) : null;
  let vat = taxVal != null ? Number(taxVal) : null;
  let net = lineExtVal != null ? Number(lineExtVal) : (gross != null && vat != null ? Number((gross - vat).toFixed(2)) : null);

  return {
    format: "ubl_like",
    date: issueDate || null,
    currency: currency || null,
    gross,
    vat,
    net,
    supplier: sup || null
  };
}

// ── APP ────────────────────────────────────────────────────────────
const app = express();
app.use(morgan("dev"));
app.use(express.json({ limit: "15mb" }));
app.use(cors({
  origin: (origin, cb) => {
    if (!origin) return cb(null, true);
    if (ORIGINS.includes(origin)) return cb(null, true);
    cb(new Error(`CORS blocked: ${origin}`));
  }
}));

app.get("/healthz", (req, res) => res.json({ ok: true }));

/**
 * POST /ingest
 * Erkennt XML (XRechnung/UBL-ähnlich) → Felder extrahieren & normalisieren.
 * Sonst: markiert "needs_ocr".
 * Body: { fileName, mime, dataBase64, tenantId?, userId? }
 */
app.post("/ingest", async (req, res) => {
  const { fileName, mime, dataBase64, tenantId, userId } = req.body || {};
  if (!fileName || !mime || !dataBase64) {
    return res.status(400).json({ error: "fileName, mime, dataBase64 required" });
  }
  const requestId = nanoid();
  const id = nanoid();

  let fields = {};
  let route = "needs_ocr";
  let rawText = "";

  const looksXml = /xml/i.test(mime) || /\.xml$/i.test(fileName);
  if (looksXml) {
    try {
      rawText = Buffer.from(dataBase64, "base64").toString("utf8");
      const xml = parser.parse(rawText);
      // Häufige UBL-Wurzeln: "Invoice", "CrossIndustryInvoice" etc.
      fields = normalizeFromUbl(xml);
      route = "xml";
    } catch (e) {
      // Fallback: als nicht-XML behandeln
      route = "needs_ocr";
      fields = {};
    }
  } else {
    // PDF/PNG/JPG → heute noch kein Server-OCR: markiere für OCR
    route = "needs_ocr";
  }

  await pool.query(
    `insert into receipts (id, tenant_id, user_id, file_name, mime, raw_text, fields, route, last_request_id)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
    [id, tenantId || null, userId || null, fileName, mime, rawText, fields, route, requestId]
  );

  return res.json({
    requestId,
    route,
    normalized: fields,
    hint: route === "needs_ocr" ? "No XML detected – use OCR path" : undefined
  });
});

/** Feedback wie gehabt – zum Lernen später */
app.post("/feedback", async (req, res) => {
  const p = req.body || {};
  const required = ["fileName", "verdict", "original", "timestamp"];
  for (const k of required) if (!(k in p)) return res.status(400).json({ error: `missing ${k}` });
  if (!["accepted","corrected"].includes(p.verdict)) return res.status(400).json({ error: "invalid verdict" });

  const id = nanoid();
  await pool.query(
    `insert into feedback_events (id, request_id, file_name, verdict, original, corrected)
     values ($1,$2,$3,$4,$5,$6)`,
    [id, p.requestId || null, p.fileName, p.verdict, p.original, p.corrected || null]
  );
  res.json({ ok: true, id });
});

app.listen(PORT, () => {
  console.log(`ai-extractor listening on :${PORT}`);
});
