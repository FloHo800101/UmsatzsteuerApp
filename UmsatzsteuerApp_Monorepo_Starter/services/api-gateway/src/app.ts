import express from 'express';
const app = express();
app.use(express.json());

app.get('/health', (_req, res) => res.json({ ok: true }));

export default app;

app.post('/elster/submit', (_req, res) => {
  const ack = Math.random() < 0.8;
  if (ack) return res.json({ status: 'ack', ackCode: 'TT-' + Math.floor(Math.random()*1e6) });
  return res.json({ status: 'nack', errorMessage: 'Mock-Fehler' });
});
