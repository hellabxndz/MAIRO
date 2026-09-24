import { describe, expect, it } from "vitest";
import { detectKind, extractText } from "./extract";

const enc = (s: string) => new TextEncoder().encode(s);

describe("upload type detection", () => {
  it("trusts bytes, not just the extension", () => {
    expect(detectKind("policy.pdf", enc("%PDF-1.7 ..."))).toBe("pdf");
    expect(detectKind("policy.pdf", enc("<html>"))).toBeNull();
    expect(detectKind("guide.docx", new Uint8Array([0x50, 0x4b, 0x03, 0x04, 1]))).toBe("docx");
    expect(detectKind("guide.docx", enc("plain"))).toBeNull();
    expect(detectKind("faq.txt", enc("hello"))).toBe("text");
    expect(detectKind("faq.txt", new Uint8Array([0x68, 0x00, 0x69]))).toBeNull();
    expect(detectKind("script.exe", enc("MZ"))).toBeNull();
    expect(detectKind("page.html", enc("<p>"))).toBeNull();
  });
  it("extracts text files and refuses empty or oversized ones", async () => {
    await expect(extractText("faq.md", enc("# FAQ\nShip in 3 days"))).resolves.toMatchObject({ ok: true, text: "# FAQ\nShip in 3 days", mime: "text/markdown" });
    await expect(extractText("faq.txt", new Uint8Array())).resolves.toMatchObject({ ok: false });
    await expect(extractText("big.txt", new Uint8Array(5 * 1024 * 1024 + 1).fill(65))).resolves.toMatchObject({ ok: false, error: "Files can be up to 5 MB." });
  });
  it("rejects a corrupt pdf gracefully", async () => {
    await expect(extractText("bad.pdf", enc("%PDF-garbage"))).resolves.toMatchObject({ ok: false });
  });
});
