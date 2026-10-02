import { strFromU8, unzipSync } from "fflate";

const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const PDF_MIME = "application/pdf";

export function resumeMime(fileName: string): string | null {
  const lower = fileName.toLowerCase();
  if (lower.endsWith(".pdf")) return PDF_MIME;
  if (lower.endsWith(".docx")) return DOCX_MIME;
  return null;
}

/** Pull visible text out of a DOCX `word/document.xml`. */
export function textFromDocx(bytes: Uint8Array): string {
  let entries: Record<string, Uint8Array>;
  try {
    entries = unzipSync(bytes);
  } catch {
    return "";
  }
  const xml = entries["word/document.xml"];
  if (!xml) return "";
  return decodeXml(strFromU8(xml))
    .replace(/<w:tab\/>/g, "\t")
    .replace(/<w:br\/>/g, "\n")
    .replace(/<\/w:p>/g, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function decodeXml(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

async function textFromPdf(bytes: Uint8Array): Promise<string> {
  const { extractText } = await import("unpdf");
  const { text } = await extractText(bytes, { mergePages: true });
  return text.trim();
}

export async function extractResumeText(fileName: string, bytes: Uint8Array): Promise<string> {
  const mime = resumeMime(fileName);
  if (mime === PDF_MIME) return textFromPdf(bytes);
  if (mime === DOCX_MIME) return textFromDocx(bytes);
  return "";
}
