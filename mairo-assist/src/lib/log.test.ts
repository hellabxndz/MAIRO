import { describe, expect, it } from "vitest";
import { redact } from "./log";

describe("log redaction", () => {
  it("removes emails and secrets", () => {
    const out = redact("user jane.doe@shop.com failed with token shpat_1234567890abcdef and sb_secret_abcdefghijk");
    expect(out).not.toContain("jane.doe@shop.com");
    expect(out).not.toContain("shpat_1234567890abcdef");
    expect(out).not.toContain("sb_secret_abcdefghijk");
  });
});
