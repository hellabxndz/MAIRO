import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { safeNextPath } from "./redirect";
import { decryptSecret, encryptSecret } from "./secrets";
import { randomToken, safeEqual, sha256Hex } from "./tokens";

const key = randomBytes(32).toString("base64");

describe("secret encryption", () => {
  it("round-trips and never stores plaintext", () => {
    const enc = encryptSecret("shpat_example_token", "conn-1", key);
    expect(enc).not.toContain("shpat_example_token");
    expect(enc.startsWith("v1:")).toBe(true);
    expect(decryptSecret(enc, "conn-1", key)).toBe("shpat_example_token");
  });

  it("uses a fresh IV every time", () => {
    expect(encryptSecret("x", "a", key)).not.toBe(encryptSecret("x", "a", key));
  });

  it("refuses a ciphertext moved to another row", () => {
    const enc = encryptSecret("secret", "conn-1", key);
    expect(() => decryptSecret(enc, "conn-2", key)).toThrow();
  });

  it("detects tampering and wrong keys", () => {
    const enc = encryptSecret("secret", "a", key);
    const parts = enc.split(":");
    parts[3] = Buffer.from("tampered").toString("base64url");
    expect(() => decryptSecret(parts.join(":"), "a", key)).toThrow();
    expect(() => decryptSecret(enc, "a", randomBytes(32).toString("base64"))).toThrow();
  });

  it("rejects badly sized keys", () => {
    expect(() => encryptSecret("x", "a", Buffer.alloc(16).toString("base64"))).toThrow(/32 bytes/);
    expect(() => encryptSecret("x", "a", "")).toThrow();
  });
});

describe("tokens", () => {
  it("are long, URL-safe and unique", () => {
    const a = randomToken();
    expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(randomToken()).not.toBe(a);
  });
  it("hash like Postgres digest(..., 'sha256')", () => {
    expect(sha256Hex("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });
  it("compares in constant time", () => {
    expect(safeEqual("abc", "abc")).toBe(true);
    expect(safeEqual("abc", "abd")).toBe(false);
    expect(safeEqual("abc", "abcd")).toBe(false);
  });
});

describe("post-login redirects", () => {
  it("allows same-site paths", () => {
    expect(safeNextPath("/dashboard/team")).toBe("/dashboard/team");
    expect(safeNextPath("/invite/abc?x=1")).toBe("/invite/abc?x=1");
  });
  it("blocks open redirects", () => {
    for (const bad of ["https://evil.com", "//evil.com", "/\\evil.com", "evil.com", "", "javascript:alert(1)", "/ok\nSet-Cookie: x", 42, null]) {
      expect(safeNextPath(bad)).toBe("/dashboard");
    }
  });
});
