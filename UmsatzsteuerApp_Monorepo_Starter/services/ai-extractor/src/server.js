import express from 'express';
import multer from 'multer';
import cors from 'cors';
import { runMigrations } from './run-migrations.js';
import { saveFileAndDocument } from './persist.js';
import { detectAndParseEinvoice } from './detectEinvoice.js';
import { mapFromModel } from './normalize.js';
import { extractWithAzure } from './azure.js';

const app = express();

/** -----------------------------------------
 *  CORS: nur deine Origins + lokal erlauben
 *  ----------------------------------------- */
const ALLOWED_ORIGINS = [
  'https://floho800101.github.io',                // GitHub Pages (Root-Origin)
  'http://localhost:5173',                        // Vite Dev
  'http://localhost:4173'                         // Vite Preview
];
app.use(cors({
  origin: (origin, cb) => {
    // curl/Server-zu-Server (ohne Origin) erlauben
    if (!origin) return cb(null, true);
    // exakte Origin-Whitelist
    if (ALLOWED_ORIGINS.includes(origin)) return cb(null, true);
    return cb(new Error('CORS blocked for origin: ' + origin));
  },
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: false
}));
app.options('*', cors());

// Body/Upload Limits
app.use(express.json({ limit: '25mb' }));
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 } // 25 MB
});

// Hinweis zu Azure-Keys beim Start
if (!process.env.AZURE_ENDPOINT || !process.env.AZURE_KEY) {
  console.warn('[azure] Missing AZURE_ENDPOINT or AZURE_KEY – the /extract route will not use Azure.');
}

// Health (sendet CORS-Header durch globales cors())
app.get('/health', (_req, res) => {
  res.json({ ok: true, service: 'ai-extractor' });
});

app.post('/extract', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'file is required (multipart/form-data, field "file")' });

    const { originalname, mimetype, buffer } = req.file;

    // 1) XRechnung/ZUGFeRD?
    const einv = detectAndParseEinvoice(buffer, mimetype);
    let docKind = null, raw = null, normalized = null, model = null, confidence = null;

    if (einv) {
      docKind = einv.kind;
      raw = einv.raw;
      normalized = einv.normalized;
      model = 'einvoice:xml';
      confidence = 1.0;
    } else {
      // 2) Azure-Fallback (falls Keys gesetzt)
      const out = await extractWithAzure(buffer, mimetype);
      model = out.model;
      confidence = out.confidence ?? null;
      raw = out.raw ?? {};
      normalized = mapFromModel(raw);
      docKind = 'invoice';
    }

    const persisted = await saveFileAndDocument({
      buffer,
      originalName: originalname,
      mimeType: mimetype,
      raw,
      normalized,
      docKind,
      sourceModel: model,
      modelConfidence: confidence
    });

    res.json({
      status: 'ok',
      fileId: persisted.fileId,
      documentId: persisted.documentId,
      sha256: persisted.hash,
      kind: docKind,
      model,
      confidence,
      normalized
    });
  } catch (e) {
    console.error('extract error:', e);
    res.status(500).json({ error: e.message });
  }
});

const PORT = process.env.PORT || 8080;
async function start() {
  console.log('Applying migrations...');
  await runMigrations();
  app.listen(PORT, () => console.log(`ai-extractor listening on :${PORT}`));
}
start().catch(err => {
  console.error('startup error:', err);
  process.exit(1);
});
