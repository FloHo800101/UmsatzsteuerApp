import express from 'express';
const app = express();
app.use(express.json());

app.get('/health', (_req, res) => res.json({ ok: true }));

export default app;

app.post('/extract', (_req, res) => {
  return res.json([{ partnerName:'Muster GmbH', serviceType:'Dienstleistung', vatRate:19, net:100.0 }]);
});
