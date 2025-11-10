// services/ai-extractor/src/detectEinvoice.js
// Heuristische Erkennung für XRechnung / ZUGFeRD / Factur-X / UBL
// - Falls PDF: wir suchen nach Signaturen im Byte-Stream.
// - Falls XML: wir lesen den Anfang (bis ~1MB) und suchen nach Tags/URNs.

const DECODER = new TextDecoder("utf-8");

function detectFromXml(xml) {
  const s = xml.toLowerCase();

  // EN16931 / CrossIndustryInvoice (Factur-X / ZUGFeRD)
  if (s.includes("crossindustryinvoice") || s.includes("urn:cen.eu:en16931")) {
    // Unterscheide grob
    if (s.includes("factur-x")) return { xmlType: "factur-x", xmlVersion: null, xmlRaw: xml };
    if (s.includes("zugferd")) return { xmlType: "zugferd", xmlVersion: null, xmlRaw: xml };
    return { xmlType: "xrechnung", xmlVersion: null, xmlRaw: xml }; // häufig EN16931-konform
  }

  // UBL-Hinweise
  if (s.includes("<invoice") && s.includes("oasis") || s.includes(":ubl:")) {
    return { xmlType: "ubl", xmlVersion: null, xmlRaw: xml };
  }

  // XRechnung CustomizationID (Beispiel)
  if (s.includes("xrechnung")) {
    return { xmlType: "xrechnung", xmlVersion: null, xmlRaw: xml };
  }

  return { xmlType: "unknown", xmlVersion: null, xmlRaw: xml };
}

export function detectEinvoiceFromBytes(fileName, mimeType, bytes) {
  const name = (fileName || "").toLowerCase();
  const mime = (mimeType || "").toLowerCase();

  // 1) Direkte XML-Datei?
  const looksXml = mime.includes("xml") || name.endsWith(".xml") || bytes[0] === 0x3c; // '<'
  if (looksXml) {
    const slice = bytes.length > 1_000_000 ? bytes.subarray(0, 1_000_000) : bytes;
    try {
      const xml = DECODER.decode(slice);
      return detectFromXml(xml);
    } catch {
      return { xmlType: "unknown", xmlVersion: null, xmlRaw: null };
    }
  }

  // 2) PDF-Heuristik: Suche nach Stichwörtern
  const slice = bytes.length > 2_000_000 ? bytes.subarray(0, 2_000_000) : bytes;
  let s = "";
  try {
    s = DECODER.decode(slice);
  } catch {
    s = "";
  }
  const t = s.toLowerCase();

  const hasFacturX = t.includes("factur-x");
  const hasZugferd = t.includes("zugferd");
  const hasXrechnung = t.includes("xrechnung") || t.includes("en16931");
  const hasEmbeddedFile = t.includes("/embeddedfile") || t.includes("/type /embeddedfile");

  if (hasEmbeddedFile && (hasFacturX || hasZugferd || hasXrechnung)) {
    if (hasFacturX) return { xmlType: "factur-x", xmlVersion: null, xmlRaw: null };
    if (hasZugferd) return { xmlType: "zugferd", xmlVersion: null, xmlRaw: null };
    return { xmlType: "xrechnung", xmlVersion: null, xmlRaw: null };
  }

  return { xmlType: "none", xmlVersion: null, xmlRaw: null };
}
