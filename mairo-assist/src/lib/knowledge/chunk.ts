/**
 * Split document text into overlapping passages for retrieval. Paragraph
 * boundaries are preferred; very long paragraphs are split on sentences.
 */
export function chunkText(text: string, opts: { maxChars?: number; overlapChars?: number } = {}): string[] {
  const maxChars = opts.maxChars ?? 1200;
  const overlap = opts.overlapChars ?? 150;
  const clean = text.replace(/\r\n?/g, "\n").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
  if (!clean) return [];

  const pieces: string[] = [];
  for (const para of clean.split(/\n\n/)) {
    if (para.length <= maxChars) {
      pieces.push(para);
      continue;
    }
    let current = "";
    for (const sentence of para.split(/(?<=[.!?])\s+/)) {
      if (sentence.length > maxChars) {
        if (current) pieces.push(current);
        current = "";
        for (let i = 0; i < sentence.length; i += maxChars) pieces.push(sentence.slice(i, i + maxChars));
        continue;
      }
      if ((current + " " + sentence).trim().length > maxChars) {
        pieces.push(current);
        current = sentence;
      } else current = (current + " " + sentence).trim();
    }
    if (current) pieces.push(current);
  }

  const chunks: string[] = [];
  let buf = "";
  for (const piece of pieces) {
    if (buf && (buf + "\n\n" + piece).length > maxChars) {
      chunks.push(buf);
      const tail = buf.slice(-overlap);
      const cut = tail.indexOf(" ");
      buf = (cut >= 0 ? tail.slice(cut + 1) : "") + (overlap > 0 ? "\n\n" : "") + piece;
      if (buf.length > maxChars) buf = piece;
    } else {
      buf = buf ? `${buf}\n\n${piece}` : piece;
    }
  }
  if (buf) chunks.push(buf);
  return chunks;
}

/** Rough token estimate (≈4 characters per token for English). */
export function estimateTokens(text: string) {
  return Math.ceil(text.length / 4);
}
