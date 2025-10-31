export async function ingestXmlOrMarkOcr(file: File) {
  const buf = await file.arrayBuffer();
  const b64 = btoa(String.fromCharCode(...new Uint8Array(buf)));
  const url = import.meta.env.VITE_EXTRACTOR_URL;
  const res = await fetch(`${url}/ingest`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      fileName: file.name,
      mime: file.type || "application/octet-stream",
      dataBase64: b64
    })
  });
  if (!res.ok) throw new Error(`ingest failed: ${res.status}`);
  return res.json() as Promise<{
    requestId: string;
    route: "xml" | "needs_ocr";
    normalized?: {
      format?: string; date?: string | null; currency?: string | null;
      net?: number | null; vat?: number | null; gross?: number | null; supplier?: string | null;
    };
    hint?: string;
  }>;
}
