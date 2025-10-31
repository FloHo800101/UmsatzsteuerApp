import React, { useMemo, useRef, useState } from "react";

/**
 * API-Basis: zuerst ENV, sonst Render-Default.
 */
const API_BASE =
  (import.meta as any).env?.VITE_EXTRACTOR_URL ||
  "https://umsatzsteuerapp.onrender.com";

/** Minimaler Datentyp für die Anzeige */
type Norm = {
  format: "ubl" | "cii" | "ocr" | string;
  date: string | number | null;
  supplier?: string | null;
  currency?: string | null;
  net: number | null;
  vat: number | null;
  gross: number | null;
};

type Row = {
  ts: number;
  fileName: string;
  route: string;
  norm: Norm;
};

// --- Hilfen ------------------------------------------------------------------

/** Datei → Base64 (ohne prefix) */
async function fileToBase64(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  let binary = "";
  const bytes = new Uint8Array(buf);
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(
      null,
      bytes.subarray(i, i + chunk) as any
    );
  }
  return btoa(binary);
}

/** Script dynamisch laden (für tesseract/pdf.js) */
function loadScriptOnce(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[data-src="${src}"]`)) return resolve();
    const s = document.createElement("script");
    s.async = true;
    s.defer = true;
    s.dataset.src = src;
    s.src = src;
    s.onload = () => resolve();
    s.onerror = () =>
      reject(new Error(`Script konnte nicht geladen werden: ${src}`));
    document.head.appendChild(s);
  });
}

/** Dezimal robust parsen ("," oder "." als Dezimaltrennzeichen) */
function parseAmount(maybe: string | null | undefined): number | null {
  if (!maybe) return null;
  const s = maybe
    .replace(/\s/g, "")
    .replace(/€/g, "")
    .replace(/[^0-9,.\-]/g, "");

  if (!s) return null;

  // Beide Trennzeichen vorhanden
  if (s.includes(",") && s.includes(".")) {
    const lastComma = s.lastIndexOf(",");
    const lastDot = s.lastIndexOf(".");
    if (lastComma > lastDot) return Number(s.replace(/\./g, "").replace(",", "."));
    return Number(s.replace(/,/g, ""));
  }
  if (s.includes(",")) return Number(s.replace(",", "."));
  return Number(s);
}

/** Heuristik: OCR-Text → Felder */
function heuristicParse(text: string): Norm {
  const norm: Norm = {
    format: "ocr",
    date: null,
    supplier: null,
    currency: /€|EUR/i.test(text) ? "EUR" : null,
    net: null,
    vat: null,
    gross: null,
  };

  // Datum
  const mDate =
    text.match(/\b(\d{4}-\d{2}-\d{2})\b/) ||
    text.match(/\b(\d{2}\.\d{2}\.\d{4})\b/) ||
    text.match(/\b(\d{2}\/\d{2}\/\d{4})\b/);
  if (mDate) {
    const s = mDate[1];
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) norm.date = s;
    else if (/^\d{2}\.\d{2}\.\d{4}$/.test(s)) {
      const [d, m, y] = s.split(".");
      norm.date = `${y}-${m}-${d}`;
    } else if (/^\d{2}\/\d{2}\/\d{4}$/.test(s)) {
      const [d, m, y] = s.split("/");
      norm.date = `${y}-${m}-${d}`;
    }
  }

  // Supplier
  const lines = text.split(/\n+/);
  const supp =
    lines.find((l) => /(GmbH|AG|UG|KG|OHG|Rechnung\s+von)/i.test(l)) ||
    lines[0] ||
    null;
  norm.supplier = supp?.trim() || null;

  // Beträge
  const findLine = (re: RegExp) => lines.find((l) => re.test(l)) || "";
  const nettoLine = findLine(/(netto|zwischensumme|net amount|subtotal)/i);
  const ustLine = findLine(/(USt|MWSt|VAT|tax)/i);
  const bruttoLine = findLine(/(brutto|gesamt|total|amount due|zu zahlen|payable)/i);

  const nettoNum =
    parseAmount((nettoLine.match(/([-+]?[0-9.,]+)\s*€?$/) || [])[1]) ||
    parseAmount((nettoLine.match(/€\s*([-+]?[0-9.,]+)/) || [])[1]);
  const ustNum =
    parseAmount((ustLine.match(/([-+]?[0-9.,]+)\s*€?$/) || [])[1]) ||
    parseAmount((ustLine.match(/€\s*([-+]?[0-9.,]+)/) || [])[1]);
  const bruttoNum =
    parseAmount((bruttoLine.match(/([-+]?[0-9.,]+)\s*€?$/) || [])[1]) ||
    parseAmount((bruttoLine.match(/€\s*([-+]?[0-9.,]+)/) || [])[1]);

  norm.net = nettoNum ?? null;
  norm.vat = ustNum ?? null;
  norm.gross = bruttoNum ?? null;

  // Ableiten
  if (norm.net == null && norm.gross != null && norm.vat != null) {
    norm.net = Number((norm.gross - norm.vat).toFixed(2));
  }
  if (norm.gross == null && norm.net != null && norm.vat != null) {
    norm.gross = Number((norm.net + norm.vat).toFixed(2));
  }
  return norm;
}

// --- OCR mit tesseract -------------------------------------------------------

declare global {
  interface Window {
    Tesseract?: any;
    pdfjsLib?: any;
  }
}

/**
 * Erste Seite eines PDFs zu Canvas rendern (pdf.js via CDN).
 * WICHTIG: pdf.js 2.16.105 verwenden – stellt `pdfjsLib` global bereit.
 */
async function pdfFirstPageToCanvas(file: File): Promise<HTMLCanvasElement> {
  const PDFJS_URL = "https://cdn.jsdelivr.net/npm/pdfjs-dist@2.16.105/build/pdf.min.js";
  const PDFJS_WORKER_URL = "https://cdn.jsdelivr.net/npm/pdfjs-dist@2.16.105/build/pdf.worker.min.js";

  if (!window.pdfjsLib) {
    await loadScriptOnce(PDFJS_URL);
  }
  if (!window.pdfjsLib) {
    throw new Error("pdf.js konnte nicht geladen werden (pdfjsLib nicht verfügbar).");
  }
  // Worker konfigurieren
  window.pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER_URL;

  // Direkt aus ArrayBuffer laden → keine CORS-Probleme
  const data = new Uint8Array(await file.arrayBuffer());
  const doc = await window.pdfjsLib.getDocument({ data }).promise;
  const page = await doc.getPage(1);

  const viewport = page.getViewport({ scale: 2.0 });
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d")!;
  canvas.width = viewport.width;
  canvas.height = viewport.height;

  await page.render({ canvasContext: ctx, viewport }).promise;
  return canvas;
}

/** Bild/Canvas mit tesseract erkennen (DE+EN) */
async function ocrElementToText(el: HTMLImageElement | HTMLCanvasElement) {
  if (!window.Tesseract) {
    await loadScriptOnce(
      "https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js"
    );
  }
  const { data } = await window.Tesseract.recognize(el, "deu+eng", {
    langPath: "https://tessdata.projectnaptha.com/4.0.0",
  });
  return String(data?.text || "");
}

// -----------------------------------------------------------------------------

export default function Belege() {
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [detail, setDetail] = useState<Norm | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const canUpload = useMemo(() => !!file && !busy, [file, busy]);

  async function sendFeedback(
    original: Norm,
    verdict: "accepted" | "corrected",
    fileName: string,
    requestId?: string
  ) {
    try {
      await fetch(`${API_BASE}/feedback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requestId,
          fileName,
          verdict,
          original,
          corrected: null,
          timestamp: new Date().toISOString(),
        }),
      });
    } catch {
      // optional ignorieren
    }
  }

  async function handleUpload() {
    if (!file) return;
    setBusy(true);
    setMessage(null);
    setDetail(null);

    try {
      const b64 = await fileToBase64(file);
      const r = await fetch(`${API_BASE}/ingest`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fileName: file.name,
          mime: file.type || "application/octet-stream",
          dataBase64: b64,
        }),
      });
      const j = await r.json();

      let route: string = j.route;
      let norm: Norm = j.normalized as Norm;

      // OCR-Fallback (lokal) wenn kein XML gefunden wurde
      if (route === "needs_ocr" || route === "pdf-no-xml") {
        setMessage("Kein XML erkannt – starte lokale OCR …");

        if (/^image\//i.test(file.type)) {
          const img = document.createElement("img");
          img.src = URL.createObjectURL(file);
          await new Promise<void>((res) => (img.onload = () => res()));
          const text = await ocrElementToText(img);
          URL.revokeObjectURL(img.src);
          norm = heuristicParse(text);
          route = "ocr-local";
        } else if (file.type === "application/pdf") {
          const canvas = await pdfFirstPageToCanvas(file);
          const text = await ocrElementToText(canvas);
          norm = heuristicParse(text);
          route = "ocr-local";
        } else {
          setMessage("Kein XML erkannt – Dateityp nicht für OCR unterstützt.");
        }
      }

      // Anzeige + Liste
      setDetail(norm);
      setRows((prev) => [
        {
          ts: Date.now(),
          fileName: file.name,
          route,
          norm,
        },
        ...prev.slice(0, 49),
      ]);

      // positives Feedback automatisch senden (POC)
      await sendFeedback(norm, "accepted", file.name, j.requestId);

      setMessage(
        route === "ocr-local"
          ? "OCR erfolgreich. Felder heuristisch erkannt."
          : route.startsWith("pdf-zugferd")
          ? "ZUGFeRD/Factur-X erkannt."
          : "XML erkannt – Felder übernommen."
      );
    } catch (e: any) {
      setMessage(`Fehler beim Verarbeiten: ${e?.message || e}`);
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
      setFile(null);
    }
  }

  return (
    <div className="max-w-4xl mx-auto p-6">
      <h1 className="text-2xl font-semibold mb-4">Belege hochladen</h1>

      <div className="flex gap-3 items-center">
        <input
          ref={inputRef}
          type="file"
          accept=".xml,application/xml,application/pdf,image/png,image/jpeg,image/jpg"
          onChange={(e) => setFile(e.target.files?.[0] || null)}
        />
        <button
          disabled={!canUpload}
          onClick={handleUpload}
          className={`px-4 py-2 rounded text-white ${
            canUpload ? "bg-blue-600 hover:bg-blue-700" : "bg-gray-400"
          }`}
        >
          {busy ? "Bitte warten …" : "Upload & Interpretieren"}
        </button>
      </div>

      {message && (
        <p className="mt-3 text-sm text-gray-700" role="status">
          {message}
        </p>
      )}

      {detail && (
        <div className="mt-6 border rounded p-4">
          <h2 className="font-medium mb-3">Erkannte Felder</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-y-1">
            <div className="text-gray-500">Datum</div>
            <div className="col-span-2">{detail.date ?? "—"}</div>

            <div className="text-gray-500">Netto</div>
            <div className="col-span-2">
              {detail.net != null ? detail.net : "—"}
            </div>

            <div className="text-gray-500">USt</div>
            <div className="col-span-2">
              {detail.vat != null ? detail.vat : "—"}
            </div>

            <div className="text-gray-500">Brutto</div>
            <div className="col-span-2">
              {detail.gross != null ? detail.gross : "—"}
            </div>

            <div className="text-gray-500">Währung</div>
            <div className="col-span-2">{detail.currency ?? "—"}</div>

            <div className="text-gray-500">Lieferant</div>
            <div className="col-span-2">{detail.supplier ?? "—"}</div>
          </div>
        </div>
      )}

      <h2 className="mt-8 mb-3 font-medium">Letzte Belege</h2>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left border-b">
              <th className="py-2">Datum</th>
              <th>Datei</th>
              <th>Route</th>
              <th>Netto</th>
              <th>USt</th>
              <th>Brutto</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, idx) => (
              <tr key={r.ts + "_" + idx} className="border-b">
                <td className="py-1">
                  {new Date(r.ts).toLocaleString("de-DE")}
                </td>
                <td>{r.fileName}</td>
                <td>
                  <span className="inline-block rounded bg-gray-100 px-2 py-0.5">
                    {r.route}
                  </span>
                </td>
                <td>{r.norm.net ?? "—"}</td>
                <td>{r.norm.vat ?? "—"}</td>
                <td>{r.norm.gross ?? "—"}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} className="py-4 text-gray-500">
                  Noch keine Uploads in dieser Session.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
