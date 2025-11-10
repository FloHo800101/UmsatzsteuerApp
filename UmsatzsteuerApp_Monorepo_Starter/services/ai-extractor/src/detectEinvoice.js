import { XMLParser } from 'fast-xml-parser';
import { mapFromEinvoice } from './normalize.js';

const XRECHNUNG_HINTS = ['CrossIndustryInvoice', 'rsm:CrossIndustryInvoice'];
const ZUGFERD_HINTS = ['CrossIndustryDocument', 'rdf:CrossIndustryDocument', 'zf:CrossIndustryDocument'];

export function detectAndParseEinvoice(buffer, mimeType) {
  const isXmlMime = (mimeType || '').includes('xml');
  const startsWithLt = buffer && buffer.length > 5 && buffer[0] === 0x3c; // '<'

  if (!isXmlMime && !startsWithLt) return null; // sehr einfache Heuristik

  const xmlText = buffer.toString('utf8');
  const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '' });
  let raw;
  try {
    raw = parser.parse(xmlText);
  } catch {
    return null;
  }

  const xmlStr = xmlText.toLowerCase();
  let kind = null;
  if (XRECHNUNG_HINTS.some(h => xmlStr.includes(h.toLowerCase()))) kind = 'xrechnung';
  if (!kind && ZUGFERD_HINTS.some(h => xmlStr.includes(h.toLowerCase()))) kind = 'zugferd';
  if (!kind) kind = 'xml';

  const normalized = mapFromEinvoice(raw);
  return { kind, raw, normalized };
}
