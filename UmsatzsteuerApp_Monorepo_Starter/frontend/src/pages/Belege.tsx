import { useState } from "react";
import { ingestXmlOrMarkOcr } from "@/services/extractor";
import { sendFeedback } from "@/services/feedback";

type Norm = {
  format?: string; date?: string | null; currency?: string | null;
  net?: number | null; vat?: number | null; gross?: number | null; supplier?: string | null;
};

export default function Belege() {
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState<string>("");
  const [normalized, setNormalized] = useState<Norm | null>(null);
  const [requestId, setRequestId] = useState<string | null>(null);

  async function onUpload() {
    if (!file) return;
    setStatus("Sende…");
    setNormalized(null);
    try {
      const resp = await ingestXmlOrMarkOcr(file);
      setRequestId(resp.requestId);
      if (resp.route === "xml") {
        setNormalized(resp.normalized ?? null);
        setStatus("XML erkannt – Felder übernommen.");
      } else {
        setStatus("Kein XML erkannt – OCR-Pfad nötig (kommt später).");
      }
    } catch (e: any) {
      setStatus("Fehler: " + e?.message);
    }
  }

  async function accept() {
    if (!file || !normalized) return;
    await sendFeedback({
      requestId: requestId ?? undefined,
      fileName: file.name,
      verdict: "accepted",
      original: normalized
    });
    setStatus("Feedback gespeichert (accepted).");
  }

  return (
    <div className="max-w-3xl mx-auto p-6">
      <h1 className="text-2xl font-semibold mb-4">Belege hochladen</h1>

      <div className="flex items-center gap-3 mb-4">
        <input type="file" accept=".xml,application/xml,application/pdf,image/*"
               onChange={e => setFile(e.target.files?.[0] ?? null)} />
        <button onClick={onUpload} className="px-4 py-2 rounded bg-blue-600 text-white">
          Upload & Interpretieren
        </button>
      </div>

      {status && <p className="mb-4 text-sm text-gray-700">{status}</p>}

      {normalized && (
        <div className="border rounded p-4 bg-white shadow-sm">
          <h2 className="font-medium mb-2">Erkannte Felder</h2>
          <table className="w-full text-sm">
            <tbody>
              <tr><td className="pr-3 py-1 text-gray-600">Datum</td><td>{normalized.date ?? "—"}</td></tr>
              <tr><td className="pr-3 py-1 text-gray-600">Netto</td><td>{normalized.net ?? "—"}</td></tr>
              <tr><td className="pr-3 py-1 text-gray-600">USt</td><td>{normalized.vat ?? "—"}</td></tr>
              <tr><td className="pr-3 py-1 text-gray-600">Brutto</td><td>{normalized.gross ?? "—"}</td></tr>
              <tr><td className="pr-3 py-1 text-gray-600">Währung</td><td>{normalized.currency ?? "—"}</td></tr>
              <tr><td className="pr-3 py-1 text-gray-600">Lieferant</td><td>{normalized.supplier ?? "—"}</td></tr>
            </tbody>
          </table>

          <div className="mt-4 flex gap-2">
            <button onClick={accept} className="px-3 py-2 rounded bg-green-600 text-white">
              Richtig (Feedback senden)
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
