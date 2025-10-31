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

// ── DB (optional, aber bevorzugt) ─────────────────────────────────────────────
let pool = null;
let lastDbPingOk = false;
async function initDb() {
  if (!DATABASE_URL) {
    console.warn("[ai-extractor] No DATABASE_URL set → running WITHOUT persistence.");
    return;
  }
  // Bei externen Providern ggf. SSL nötig; Internal-URLs in derselben Region brauchen i. d. R. keins
  const needsSSL = /neon\.tech|supabase\.co|amazonaws\.com|azure\.com|gcp|renderusercontent\.com/i.test(DATABASE_URL);
  pool = new Pool({
    connectionString: DATABASE_URL,
    ssl: needsSSL ? { rejectUnauthorized: false } : undefined
  });

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
      route text,
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

  // erster Ping
  try {
    await pool.query("select now()");
    lastDbPingOk = true;
  } catch {
    lastDbPingOk = false;
  }
}
await initDb();

// ── XML Parser & Normalizer ───────────────────────────────────────────────────
const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@",
  removeNSPrefix: true,
  allowBooleanAttributes: true
});

function normalizeFromUbl(u) {
  const inv = u.Invoice || u;
  const monetary = inv?.LegalMonetaryTotal || {};
  const payable = monetary?.PayableAmount;
  const lineExt = monetary?.LineExtensionAmount;
  const taxTotal = inv?.TaxTotal?.TaxAmount;

  const toNum = v => (typeof v === "object" ? (v["#text"] || v["@value"]) : v);
  const currency =
    (typeof payable === "object" && payable?.["@currencyID"]) ||
    (typeof lineExt === "object" && lineExt?.["@currencyID"]) ||
    (typeof taxTotal === "object" && taxTotal?.["@currencyID"]) || null;

  const gross = payable != null ? Number(toNum(payable)) : null;
  const vat   = taxTotal != null ? Number(toNum(taxTotal)) : null;
  const net   = lineExt != null ? Number(toNum(lineExt)) : (gross != null && vat != null ? Number((gross - vat).toFixed(2)) : null);

  const supplier =
    inv?.AccountingSupplierParty?.Party?.PartyName?.Name ||
    inv?.AccountingSupplierParty?.Party?.Name || null;

  const date = inv?.IssueDate || inv?.InvoiceDate || null;

  return { format: "ubl_like", date, currency, net, vat, gross, supplier };
}

// ── APP ──────────────────────────────────────────────────────────────────────
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

// Health zeigt jetzt auch DB-Status + Live-Ping
app.get("/healthz", async (_req, res) => {
  let db = !!pool;
  if (pool) {
    try { await pool.query("select 1"); lastDbPingOk = true; }
    catch { lastDbPingOk = false; }
  }
  res.json({ ok: true, db, dbPing: lastDbPingOk });
});

// Kleines Debug-Endpoint: Anzahl Belege (hilft bei Verifikation)
app.get("/_debug/receipts/count", async (_req, res) => {
  if (!pool) return res.json({ count: 0, db: false });
  const r = await pool.query("select count(*)::int as c from receipts");
  res.json({ count: r.rows[0].c, db: true });
});

// Ingest wie gehabt
app.post("/ingest", async (req, res) => {
  const { fileName, mime, dataBase64, tenantId, userId } = req.body || {};
  if (!fileName || !mime || !dataBase64) return res.status(400).json({ error: "fileName, mime, dataBase64 required" });

  const requestId = nanoid();
  let route = "needs_ocr";
  let rawText = "";
  let normalized = {};

  const looksXml = /xml/i.test(mime) || /\.xml$/i.test(fileName);
  if (looksXml) {
    try {
      rawText = Buffer.from(dataBase64, "base64").toString("utf8");
      const xml = parser.parse(rawText);
      normalized = normalizeFromUbl(xml);
      route = "xml";
    } catch { route = "needs_ocr"; }
  }

  if (pool) {
    await pool.query(
      `insert into receipts (id, tenant_id, user_id, file_name, mime, raw_text, fields, route, last_request_id)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [nanoid(), tenantId || null, userId || null, fileName, mime, rawText, normalized, route, requestId]
    );
  }

  res.json({ requestId, route, normalized, hint: route === "needs_ocr" ? "No XML detected – use OCR path" : undefined });
});

// Feedback
app.post("/feedback", async (req, res) => {
  const p = req.body || {};
  const required = ["fileName", "verdict", "original", "timestamp"];
  for (const k of required) if (!(k in p)) return res.status(400).json({ error: `missing ${k}` });
  if (!["accepted","corrected"].includes(p.verdict)) return res.status(400).json({ error: "invalid verdict" });

  if (pool) {
    await pool.query(
      `insert into feedback_events (id, request_id, file_name, verdict, original, corrected)
       values ($1,$2,$3,$4,$5,$6)`,
      [nanoid(), p.requestId || null, p.fileName, p.verdict, p.original, p.corrected || null]
    );
  }
  res.json({ ok: true, persisted: !!pool });
});

app.listen(PORT, () => {
  console.log(`ai-extractor listening on :${PORT} (db=${!!pool ? "on" : "off"})`);
});
