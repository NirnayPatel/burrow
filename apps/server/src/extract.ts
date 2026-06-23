// Extract plain text from an uploaded file (13-CONTEXT-SPEC §4). OSS parsers,
// text-only output. Scanned/image PDFs yield no text → caller tells the user to
// paste instead (no OCR in v1).
import mammoth from "mammoth";

export const MAX_BYTES = 10 * 1024 * 1024; // 10 MB

export type ExtractResult = { text: string; kind: "pdf" | "docx" | "text" };

export async function extractText(
  fileName: string,
  bytes: Buffer,
): Promise<ExtractResult> {
  if (bytes.length > MAX_BYTES) {
    throw new Error("file too large (max 10 MB)");
  }
  const lower = fileName.toLowerCase();

  if (lower.endsWith(".pdf")) {
    // pdf-parse v2 exposes a PDFParse class; import lazily.
    const { PDFParse } = await import("pdf-parse");
    const parser = new PDFParse({ data: new Uint8Array(bytes) });
    const result = await parser.getText();
    return { text: (result.text ?? "").trim(), kind: "pdf" };
  }
  if (lower.endsWith(".docx")) {
    const { value } = await mammoth.extractRawText({ buffer: bytes });
    return { text: (value ?? "").trim(), kind: "docx" };
  }
  if (lower.endsWith(".md") || lower.endsWith(".txt") || lower.endsWith(".markdown")) {
    return { text: bytes.toString("utf8").trim(), kind: "text" };
  }
  throw new Error("unsupported file type — use PDF, docx, md, or txt");
}
