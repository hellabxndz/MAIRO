import { describe, expect, it } from "vitest";
import { normalizeOrigin } from "./url";

describe("normalizeOrigin", () => {
  it("accepts full addresses and strips paths and slashes", () => {
    expect(normalizeOrigin("https://mairo-assist.vercel.app")).toBe("https://mairo-assist.vercel.app");
    expect(normalizeOrigin("https://mairo-assist.vercel.app/")).toBe("https://mairo-assist.vercel.app");
    expect(normalizeOrigin(" https://assist.example.com/dashboard ")).toBe("https://assist.example.com");
    expect(normalizeOrigin("http://localhost:3100")).toBe("http://localhost:3100");
  });
  it("adds https:// when it was left off", () => {
    expect(normalizeOrigin("mairo-assist.vercel.app")).toBe("https://mairo-assist.vercel.app");
  });
  it("rejects values that aren't web addresses", () => {
    for (const bad of ["", "   ", undefined, null, "not a url", "ftp://x.com", "javascript:alert(1)", "localhostx"]) {
      expect(normalizeOrigin(bad)).toBeNull();
    }
  });
});
