import express from 'express';
import multer from 'multer';
import { runMigrations } from './run-migrations.js';
import { saveFileAndDocument } from './persist.js';
import { detectAndParseEinvoice } from './detectEinvoice.js';
import { mapFromModel } from './normalize.js';
import { extractWithAzure } from './azure.js';

const upload = multer({ storage: multer.memoryStorage() });
const app = express();
app.use(express.json({ limit: '10mb' }));

// Hinweis zu Azure-Keys beim Start
if (!process.env.AZURE_ENDPOINT || !process.env.AZURE_KEY) {
  console.warn('[azure] Missing AZURE_ENDPOINT or AZURE_KEY – the /extract route will not use Azure.');
}

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
      confidence = 1.0; // Parser-basiert
    } else {
      // 2) Azure (falls Keys da)
      const out = await extractWithAzure(buffer, mimetype);
      model = out.model;
      confidence = out.confidence ?? null;
      raw = out.raw ?? {};
      normalized = mapFromModel(raw);
      docKind = 'invoice'; // default
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

// Serverstart inkl. Migrationen
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
