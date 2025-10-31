import { useEffect, useMemo, useState } from "react";

type Normalized = {
  format?: string;
  date?: string | number | null;
  supplier?: string | null;
  currency?: string | null;
  net?: number | null;
  vat?: number | null;
  gross?: number | null;
};

type ReceiptRow = {
  id: string;
  created_at: string;
  file_name: string;
  route: string;
  fields: Normalized;
};

export default function Belege() {
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "ok" | "needs_ocr" | "error">("idle");
  const [msg, setMsg] = useState<string>("");
  const [data, setData] = useState<Normalized | null>(null);
  const [rows, setRows] = useState<ReceiptRow[]>([]);

  const API_BASE = useMemo(
    () => (import.meta as any).env?.VITE_EXTRACTOR_URL || "https://umsatzsteuerapp.onrender.com",
    []
  );

  async function loadRecent() {
    try {
      const r = await fetch(`${API_BASE}/receipts/recent?limit=10`);
      const j = await r.json();
      setRows(j);
    } catch {
      // ignore
    }
  }

  function toBase64(f: File): Promise<string> {
    return f.arrayBuffer().then((buf) => {
      const bytes = new Uint8Array(buf);
      let bin = "";
      for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
      return btoa(bin);
    });
  }

  async function onUpload() {
    if (!file) return;
    setStatus("loading");
    setMsg("");
    setData(null);

    try {
      const b64 = await toBase64(file);
      const resp = await fetch(`${API_BASE}/ingest`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fileName: file.name,
          mime: file.type || guessMime(file.name),
          dataBase64: b64,
        }),
      });
      const json = await resp.json();

      const route: string = String(json.route || "");
      const isOk =
        route.startsWith("xml") ||          // xml-cii | xml-ubl
        route.startsWith("pdf-zugferd-");   // pdf-zugferd-cii | pdf-zugferd-ubl
      const needOcr = route === "pdf-no-xml" || route === "needs_ocr";

      if (isOk) {
        setData(json.normalized as Normalized);
        setStatus("ok");
        await loadRecent();
      } else if (needOcr) {
        setStatus("needs_ocr");
        setMsg("Kein eingebettetes XML gefunden – OCR-Fallback kommt als nächstes.");
      } else {
        setStatus("error");
        setMsg("Unerwartete Antwort vom Server.");
      }
    } catch (e: any) {
      setStatus("error");
      setMsg(e?.message || "Upload fehlgeschlagen");
    }
  }

  useEffect(() => {
    loadRecent().catch(() => {});
  }, []);

  return (
    <div className="p-6 max-w-4xl">
      <h1 className="text-2xl font-semibold mb-4">Belege hochladen</h1>

      <div className="flex items-center gap-3 mb-4">
        <input
          type="file"
          accept=".xml,.pdf,.png,.jpg,.jpeg"
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

      {status === "ok" && data && (
        <div className="border rounded p-4 mt-4">
          <h2 className="font-medium mb-3">Erkannte Felder</h2>
          <dl className="grid grid-cols-3 gap-y-2">
            <dt className="text-gray-500">Datum</dt><dd className="col-span-2">{String(data.date ?? "—")}</dd>
            <dt className="text-gray-500">Netto</dt><dd className="col-span-2">{data.net ?? "—"}</dd>
            <dt className="text-gray-500">USt</dt><dd className="col-span-2">{data.vat ?? "—"}</dd>
            <dt className="text-gray-500">Brutto</dt><dd className="col-span-2">{data.gross ?? "—"}</dd>
            <dt className="text-gray-500">Währung</dt><dd className="col-span-2">{data.currency ?? "—"}</dd>
            <dt className="text-gray-500">Lieferant</dt><dd className="col-span-2">{data.supplier ?? "—"}</dd>
          </dl>
        </div>
      )}

      {status === "needs_ocr" && (
        <div className="border rounded p-4 mt-4">
          <h2 className="font-medium mb-2">OCR-Fallback</h2>
          <p className="text-sm text-gray-600">{msg}</p>
        </div>
      )}

      {status === "error" && (
        <div className="border rounded p-4 mt-4">
          <h2 className="font-medium mb-2">Fehler</h2>
          <p className="text-sm text-red-600">{msg}</p>
        </div>
      )}

      <h2 className="text-xl font-semibold mt-10 mb-3">Letzte Belege</h2>
      <div className="overflow-x-auto border rounded">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 text-left">
              <th className="p-2">Datum</th>
              <th className="p-2">Datei</th>
              <th className="p-2">Route</th>
              <th className="p-2">Netto</th>
              <th className="p-2">USt</th>
              <th className="p-2">Brutto</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const f = r.fields || {};
              return (
                <tr key={r.id} className="border-t">
                  <td className="p-2">{new Date(r.created_at).toLocaleString()}</td>
                  <td className="p-2">{r.file_name}</td>
                  <td className="p-2">{r.route}</td>
                  <td className="p-2">{f.net ?? "—"}</td>
                  <td className="p-2">{f.vat ?? "—"}</td>
                  <td className="p-2">{f.gross ?? "—"}</td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr><td className="p-4 text-gray-500" colSpan={6}>Noch keine Einträge.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function guessMime(name: string) {
  if (/\.xml$/i.test(name)) return "application/xml";
  if (/\.pdf$/i.test(name)) return "application/pdf";
  if (/\.(png)$/i.test(name)) return "image/png";
  if (/\.(jpe?g)$/i.test(name)) return "image/jpeg";
  return "application/octet-stream";
}
