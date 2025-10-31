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
  .split(",").map((s) => s.trim()).filter(Boolean);

// ──────────────────────────────────────────────────────────────────────────────
// XML-Hilfen
// ──────────────────────────────────────────────────────────────────────────────
const asArray = (v) => (Array.isArray(v) ? v : v == null ? [] : [v]);

const getText = (v) => {
  if (v == null) return null;
  if (typeof v === "string" || typeof v === "number") return String(v);
  return v["#text"] ?? v._text ?? v.value ?? null;
};

const getNum = (v) => {
  const s = getText(v);
  if (s == null) return null;
  const n = Number(String(s).replace(",", "."));
  return Number.isFinite(n) ? n : null;
};

const getAttr = (node, name) =>
  node?.[`@_${name}`] ?? node?.[`@${name}`] ?? node?.[name] ?? null;

// ──────────────────────────────────────────────────────────────────────────────
// UBL Normalisierung
// ──────────────────────────────────────────────────────────────────────────────
function normalizeFromUblParsed(rootObj) {
  const inv = rootObj.Invoice || rootObj;
  const monetary = inv?.LegalMonetaryTotal || {};
  const payable = monetary?.PayableAmount;
  const lineExt = monetary?.LineExtensionAmount;
  const taxTotal = inv?.TaxTotal?.TaxAmount;

  const currency =
    getAttr(payable, "currencyID") ||
    getAttr(lineExt, "currencyID") ||
    getAttr(taxTotal, "currencyID") || null;

  const gross = payable != null ? getNum(payable) : null;
  const vat   = taxTotal != null ? getNum(taxTotal) : null;
  const net   = lineExt != null ? getNum(lineExt)
              : (gross != null && vat != null ? Number((gross - vat).toFixed(2)) : null);

  const supplier =
    inv?.AccountingSupplierParty?.Party?.PartyName?.Name ||
    inv?.AccountingSupplierParty?.Party?.Name || null;

  const date = inv?.IssueDate || inv?.InvoiceDate || null;

  return { format: "ubl", date, currency, net, vat, gross, supplier };
}

// ──────────────────────────────────────────────────────────────────────────────
// CII/XRechnung Normalisierung
// ──────────────────────────────────────────────────────────────────────────────
function normalizeFromCiiParsed(cii) {
  // Datum (Formatcode 102 = YYYYMMDD)
  let date = null;
  const dateNodeRaw =
    cii?.ExchangedDocument?.IssueDateTime?.DateTimeString ??
    cii?.ExchangedDocument?.IssueDateTime;
  const dateNode = Array.isArray(dateNodeRaw) ? dateNodeRaw[0] : dateNodeRaw;

  const dateTxt = getText(dateNode);
  const fmt = getAttr(dateNode, "format") || getAttr(dateNode, "Format");
  if (dateTxt) {
    const s = String(dateTxt);
    if ((fmt === "102" || !fmt) && /^\d{8}$/.test(s)) {
      date = `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
    } else {
      date = s;
    }
  }

  const supplier =
    cii?.SupplyChainTradeTransaction?.ApplicableHeaderTradeAgreement?.SellerTradeParty?.Name ?? null;

  const settlement =
    cii?.SupplyChainTradeTransaction?.ApplicableHeaderTradeSettlement ?? {};
  const sums =
    settlement.SpecifiedTradeSettlementHeaderMonetarySummation ??
    settlement.SpecifiedTradeSettlementMonetarySummation ?? {};

  const vatNodes = asArray(sums.TaxTotalAmount ?? settlement.TaxTotalAmount);
  const netNode =
    sums.TaxBasisTotalAmount ?? sums.LineTotalAmount ?? settlement.TaxBasisTotalAmount ?? null;
  const grossNode =
    sums.GrandTotalAmount ?? sums.TaxInclusiveAmount ?? settlement.GrandTotalAmount ?? settlement.DuePayableAmount ?? null;

  const vat   = vatNodes.length ? getNum(vatNodes[0]) : null;
  let net     = getNum(netNode);
  let gross   = getNum(grossNode);

  const currency =
    getAttr(netNode, "currencyID") ||
    getAttr(grossNode, "currencyID") ||
    (vatNodes[0] ? getAttr(vatNodes[0], "currencyID") : null) || null;

  if (net == null && gross != null && vat != null) net = Number((gross - vat).toFixed(2));
  if (gross == null && net != null && vat != null) gross = Number((net + vat).toFixed(2));

  return { format: "cii", date, supplier, currency, net, vat, gross };
}

// ──────────────────────────────────────────────────────────────────────────────
// PDF → ZUGFeRD/Factur-X: Eingebettete XML extrahieren (falls vorhanden)
// ──────────────────────────────────────────────────────────────────────────────
async function extractZugferdXmlFromPdf(pdfBuffer) {
  try {
    // pdfjs-dist im Node: legacy build nutzen
    const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
    // Worker im Node meist nicht nötig; falls doch, deaktivieren wir Eval
    const loadingTask = pdfjs.getDocument({
      data: new Uint8Array(pdfBuffer),
      isEvalSupported: false,
      useSystemFonts: true
    });
    const pdf = await loadingTask.promise;

    const attachments = await pdf.getAttachments();
    if (attachments) {
      for (const [name, att] of Object.entries(attachments)) {
        const a = att; // { filename, content, contentType }
        const filename = a.filename || name;
        const contentType = a.contentType || a.mimeType || "";
        const content = a.content; // Uint8Array
        if (/xml/i.test(contentType) || /\.xml$/i.test(filename)) {
          const xml = Buffer.from(content).toString("utf8");
          return { xml, filename };
        }
      }
    }
    return null;
  } catch (e) {
    console.warn("[zugferd] PDF parse failed:", e?.message);
    return null;
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// DB (optional)
// ──────────────────────────────────────────────────────────────────────────────
let pool = null;
let lastDbPingOk = false;

async function initDb() {
  if (!DATABASE_URL) {
    console.warn("[ai-extractor] No DATABASE_URL set → running WITHOUT persistence.");
    return;
  }
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

  try { await pool.query("select now()"); lastDbPingOk = true; }
  catch { lastDbPingOk = false; }
}
await initDb();

// ──────────────────────────────────────────────────────────────────────────────
// App
// ──────────────────────────────────────────────────────────────────────────────
const app = express();
app.use(morgan("dev"));
app.use(express.json({ limit: "25mb" }));
app.use(cors({
  origin: (origin, cb) => {
    if (!origin) return cb(null, true);
    if (ORIGINS.includes(origin)) return cb(null, true);
    cb(new Error(`CORS blocked: ${origin}`));
  }
}));

app.get("/healthz", async (_req, res) => {
  let db = !!pool;
  if (pool) {
    try { await pool.query("select 1"); lastDbPingOk = true; }
    catch { lastDbPingOk = false; }
  }
  res.json({ ok: true, db, dbPing: lastDbPingOk });
});

app.get("/_debug/receipts/count", async (_req, res) => {
  if (!pool) return res.json({ count: 0, db: false });
  const r = await pool.query("select count(*)::int as c from receipts");
  res.json({ count: r.rows[0].c, db: true });
});

// Letzte Belege (für Übersicht)
app.get("/receipts/recent", async (req, res) => {
  if (!pool) return res.json([]);
  const limit = Math.min(parseInt(req.query.limit || "10", 10), 100);
  const r = await pool.query(
    `select id, created_at, file_name, route, fields from receipts order by created_at desc limit $1`,
    [limit]
  );
  res.json(r.rows);
});

// OCR-Text-Upload (Client-OCR per Tesseract)
app.post("/ocr/ingestText", async (req, res) => {
  const { fileName, rawText, tenantId, userId } = req.body || {};
  if (!fileName || !rawText) return res.status(400).json({ error: "fileName, rawText required" });

  // Mini-Heuristik: Versuche Beträge aus Text zu ziehen (optional, sehr simpel)
  const guessAmount = (label) => {
    const r = new RegExp(`(?:${label})[^\\d]*(\\d+[.,]\\d{2})`, "i");
    const m = rawText.match(r);
    if (m) {
      const n = Number(m[1].replace(".", "").replace(",", "."));
      return Number.isFinite(n) ? Number(n.toFixed(2)) : null;
    }
    return null;
  };
  let gross = guessAmount("Brutto|Gesamt|Total|Summe");
  let vat   = guessAmount("USt|MwSt|VAT|Tax");
  let net   = guessAmount("Netto");

  if (net == null && gross != null && vat != null) net = Number((gross - vat).toFixed(2));
  if (gross == null && net != null && vat != null) gross = Number((net + vat).toFixed(2));

  const normalized = { format: "ocr", date: null, supplier: null, currency: null, net, vat, gross };

  if (pool) {
    await pool.query(
      `insert into receipts (id, tenant_id, user_id, file_name, mime, raw_text, fields, route, last_request_id)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [nanoid(), tenantId || null, userId || null, fileName, "text/plain", rawText, normalized, "ocr-text", nanoid()]
    );
  }
  res.json({ route: "ocr-text", normalized });
});

// Universal-XML/PDF → CII/UBL erkennen, sonst OCR-Fallback
app.post("/ingest", async (req, res) => {
  const { fileName, mime, dataBase64, tenantId, userId } = req.body || {};
  if (!fileName || !mime || !dataBase64) {
    return res.status(400).json({ error: "fileName, mime, dataBase64 required" });
  }

  const requestId = nanoid();
  let route = "needs_ocr";
  let rawText = "";
  let normalized = {};

  const looksXml = /xml/i.test(mime) || /\.xml$/i.test(fileName);
  const looksPdf = /pdf/i.test(mime) || /\.pdf$/i.test(fileName);

  try {
    const buf = Buffer.from(dataBase64, "base64");

    if (looksPdf) {
      // 1) Versuche ZUGFeRD/Factur-X
      const att = await extractZugferdXmlFromPdf(buf);
      if (att?.xml) {
        rawText = att.xml;
        // universell parsen (Namespaces raus, Attribute @_)
        const universal = new XMLParser({
          ignoreAttributes: false,
          attributeNamePrefix: "@_",
          removeNSPrefix: true,
          allowBooleanAttributes: true
        }).parse(rawText);

        if (universal?.CrossIndustryInvoice) {
          normalized = normalizeFromCiiParsed(universal.CrossIndustryInvoice);
          route = "pdf-zugferd-cii";
        } else if (universal?.Invoice) {
          normalized = normalizeFromUblParsed(universal);
          route = "pdf-zugferd-ubl";
        } else {
          route = "pdf-no-xml";
        }
      } else {
        route = "pdf-no-xml";
      }
    } else if (looksXml) {
      // 2) Normales XML
      rawText = buf.toString("utf8");
      const universal = new XMLParser({
        ignoreAttributes: false,
        attributeNamePrefix: "@_",
        removeNSPrefix: true,
        allowBooleanAttributes: true
      }).parse(rawText);

      if (universal?.CrossIndustryInvoice) {
        normalized = normalizeFromCiiParsed(universal.CrossIndustryInvoice);
        route = "xml-cii";
      } else if (universal?.Invoice) {
        normalized = normalizeFromUblParsed(universal);
        route = "xml-ubl";
      } else {
        // zweiter Versuch klassisch
        const ublObj = new XMLParser({
          ignoreAttributes: false,
          attributeNamePrefix: "@",
          removeNSPrefix: true,
          allowBooleanAttributes: true
        }).parse(rawText);
        if (ublObj?.Invoice) {
          normalized = normalizeFromUblParsed(ublObj);
          route = "xml-ubl";
        } else {
          route = "needs_ocr";
        }
      }
    } else {
      route = "needs_ocr";
    }
  } catch (e) {
    console.warn("[ingest] parse failed:", e?.message);
    route = "needs_ocr";
  }

  if (pool) {
    await pool.query(
      `insert into receipts (id, tenant_id, user_id, file_name, mime, raw_text, fields, route, last_request_id)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [nanoid(), tenantId || null, userId || null, fileName, mime, rawText, normalized, route, requestId]
    );
  }

  res.json({ requestId, route, normalized, hint: route.includes("no-xml") ? "No embedded XML – use OCR" : undefined });
});

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
  console.log(`ai-extractor listening on :${PORT} (db=${pool ? "on" : "off"})`);
});
