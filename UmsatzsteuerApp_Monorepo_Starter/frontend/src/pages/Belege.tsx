import { useState } from "react";

type Normalized = {
  format?: string;
  date?: string | number | null;
  supplier?: string | null;
  currency?: string | null;
  net?: number | null;
  vat?: number | null;
  gross?: number | null;
};

export default function Belege() {
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState<
    "idle" | "loading" | "ok" | "ocr" | "error"
  >("idle");
  const [msg, setMsg] = useState<string>("");
  const [data, setData] = useState<Normalized | null>(null);

  // Fallback auf Render-URL, falls ENV im Pages-Build nicht gesetzt ist
  const API_BASE =
    (import.meta as any).env?.VITE_EXTRACTOR_URL ||
    "https://umsatzsteuerapp.onrender.com";

  async function onUpload() {
    if (!file) return;
    setStatus("loading");
    setMsg("");
    setData(null);

    // Datei -> Base64
    const b64 = await file
      .arrayBuffer()
      .then((buf) => {
        const bytes = new Uint8Array(buf);
        let bin = "";
        for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
        return btoa(bin);
      });

    try {
      const resp = await fetch(`${API_BASE}/ingest`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fileName: file.name,
          mime: file.type || "application/octet-stream",
          dataBase64: b64,
        }),
      });

      const json = await resp.json();

      // NEU: alle XML-Varianten akzeptieren (xml, xml-ubl, xml-cii, …)
      const isXml =
        typeof json.route === "string" && /^xml(?:-|$)/.test(json.route);

      if (isXml) {
        setData(json.normalized as Normalized);
        setStatus("ok");
      } else {
        setStatus("ocr");
        setMsg("Kein XML erkannt – OCR-Pfad nötig (kommt später).");
      }
    } catch (e: any) {
      setStatus("error");
      setMsg(e?.message || "Upload fehlgeschlagen");
    }
  }

  return (
    <div className="p-6 max-w-2xl">
      <h1 className="text-2xl font-semibold mb-4">Belege hochladen</h1>

      <div className="flex items-center gap-3 mb-4">
        <input
          type="file"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        />
        <button
          onClick={onUpload}
          className="px-4 py-2 rounded bg-blue-600 text-white disabled:opacity-50"
          disabled={!file || status === "loading"}
        >
          {status === "loading" ? "Lade hoch…" : "Upload & Interpretieren"}
        </button>
      </div>

      {status === "ocr" && (
        <p className="text-sm text-gray-600">
          {msg || "Kein XML erkannt – OCR-Pfad nötig (kommt später)."}
        </p>
      )}
      {status === "error" && (
        <p className="text-sm text-red-600">{msg || "Fehler"}</p>
      )}

      {status === "ok" && data && (
        <div className="border rounded p-4 mt-4">
          <h2 className="font-medium mb-3">Erkannte Felder</h2>
          <dl className="grid grid-cols-3 gap-y-2">
            <dt className="text-gray-500">Datum</dt>
            <dd className="col-span-2">{String(data.date ?? "—")}</dd>

            <dt className="text-gray-500">Netto</dt>
            <dd className="col-span-2">{data.net ?? "—"}</dd>

            <dt className="text-gray-500">USt</dt>
            <dd className="col-span-2">{data.vat ?? "—"}</dd>

            <dt className="text-gray-500">Brutto</dt>
            <dd className="col-span-2">{data.gross ?? "—"}</dd>

            <dt className="text-gray-500">Währung</dt>
            <dd className="col-span-2">{data.currency ?? "—"}</dd>

            <dt className="text-gray-500">Lieferant</dt>
            <dd className="col-span-2">{data.supplier ?? "—"}</dd>
          </dl>

          <button
            className="mt-4 px-3 py-2 rounded bg-green-600 text-white"
            onClick={() => alert("Feedback kommt später")}
          >
            Richtig (Feedback senden)
          </button>
        </div>
      )}
    </div>
  );
}
