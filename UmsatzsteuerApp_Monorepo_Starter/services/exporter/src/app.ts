import express from 'express';
const app = express();
app.use(express.json());

app.get('/health', (_req, res) => res.json({ ok: true }));

export default app;

app.get('/export/:periodId/summary.json', (req, res) => {
  const { periodId } = req.params;
  res.json({ periodId, sumByKz: { '81': { net: 100, vat: 19, gross: 119 } }, totals: { net: 100, vat7: 0, vat19: 19, vat_total: 19, gross: 119 } });
});

app.get('/export/:periodId/entries.csv', (_req, res) => {
  res.type('text/csv').send('Datum;Partner;Netto;USt-Satz;USt-Betrag;Brutto\n2025-09-01;Muster GmbH;100;19;19;119');
});
