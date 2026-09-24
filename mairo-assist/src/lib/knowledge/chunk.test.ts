import { describe, expect, it } from "vitest";
import { chunkText } from "./chunk";

describe("chunking", () => {
  it("keeps short documents whole", () => {
    expect(chunkText("Returns within 30 days.\n\nFree shipping over $75.")).toEqual(["Returns within 30 days.\n\nFree shipping over $75."]);
  });
  it("returns nothing for blank text", () => {
    expect(chunkText("  \n\n ")).toEqual([]);
  });
  it("splits long text into bounded chunks without losing words", () => {
    const para = Array.from({ length: 200 }, (_, i) => `Sentence number ${i} about returns.`).join(" ");
    const chunks = chunkText(para, { maxChars: 500, overlapChars: 50 });
    expect(chunks.length).toBeGreaterThan(5);
    for (const c of chunks) expect(c.length).toBeLessThanOrEqual(500);
    for (let i = 0; i < 200; i += 37) expect(chunks.some((c) => c.includes(`Sentence number ${i} `))).toBe(true);
  });
  it("hard-splits a single enormous word", () => {
    const chunks = chunkText("x".repeat(3000), { maxChars: 1000, overlapChars: 0 });
    expect(chunks.every((c) => c.length <= 1000)).toBe(true);
    expect(chunks.join("").length).toBe(3000);
  });
});
