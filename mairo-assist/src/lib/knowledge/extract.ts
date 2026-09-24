import "server-only";

/** Accepted upload types. Detection uses the file's bytes, not just its name. */
export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
export const MAX_DOCUMENT_CHARS = 200_000;
export const ACCEPTED_EXTENSIONS = [".txt", ".md", ".pdf", ".docx"] as const;

export type ExtractResult = { ok: true; text: string; mime: string } | { ok: false; error: string };

export function detectKind(name: string, bytes: Uint8Array): "pdf" | "docx" | "text" | null {
  const lower = name.toLowerCase();
  const isPdf = bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46; // %PDF
  const isZip = bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04; // PK..
  if (lower.endsWith(".pdf")) return isPdf ? "pdf" : null;
  if (lower.endsWith(".docx")) return isZip ? "docx" : null;
  if (lower.endsWith(".txt") || lower.endsWith(".md")) {
    if (isPdf || isZip) return null;
    // Reject binary content masquerading as text.
    const sample = bytes.subarray(0, 4096);
    for (const b of sample) if (b === 0) return null;
    return "text";
  }
  return null;
}

export async function extractText(name: string, bytes: Uint8Array): Promise<ExtractResult> {
  if (bytes.byteLength === 0) return { ok: false, error: "That file is empty." };
  if (bytes.byteLength > MAX_UPLOAD_BYTES) return { ok: false, error: "Files can be up to 5 MB." };
  const kind = detectKind(name, bytes);
  if (!kind) return { ok: false, error: "Upload a .txt, .md, .pdf or .docx file." };

  try {
    let text: string;
    let mime: string;
    if (kind === "pdf") {
      const { extractText: pdfText } = await import("unpdf");
      const result = await pdfText(new Uint8Array(bytes), { mergePages: true });
      text = result.text;
      mime = "application/pdf";
    } else if (kind === "docx") {
      const mammoth = await import("mammoth");
      const result = await mammoth.extractRawText({ buffer: Buffer.from(bytes) });
      text = result.value;
      mime = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    } else {
      text = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
      mime = name.toLowerCase().endsWith(".md") ? "text/markdown" : "text/plain";
    }
    text = text.replace(/\u0000/g, "").trim();
    if (!text) return { ok: false, error: "We couldn't find any text in that file (scanned PDFs aren't supported yet)." };
    if (text.length > MAX_DOCUMENT_CHARS) text = text.slice(0, MAX_DOCUMENT_CHARS);
    return { ok: true, text, mime };
  } catch {
    return { ok: false, error: "We couldn't read that file. Try saving it again or pasting the text instead." };
  }
}
