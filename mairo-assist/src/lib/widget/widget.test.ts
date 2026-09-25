import { describe, expect, it } from "vitest";
import { normalizeOrderName } from "@/lib/ai/order-tools";
import { signProxyParams, verifyProxySignature } from "./proxy";
import { visitorHash } from "./service";

const SECRET = "shpss_proxy_secret";

describe("App Proxy signatures", () => {
  it("accepts Shopify's signed parameters and rejects tampering", () => {
    const signed = signProxyParams({ shop: "a.myshopify.com", path_prefix: "/apps/mairo-assist", timestamp: "1700000000", logged_in_customer_id: "", visitor: "abc" }, SECRET);
    expect(verifyProxySignature(signed, SECRET)).toBe(true);
    const other = new URLSearchParams(signed);
    other.set("shop", "b.myshopify.com");
    expect(verifyProxySignature(other, SECRET)).toBe(false);
    expect(verifyProxySignature(signed, "wrong")).toBe(false);
    const unsigned = new URLSearchParams(signed);
    unsigned.delete("signature");
    expect(verifyProxySignature(unsigned, SECRET)).toBe(false);
  });

  it("joins repeated keys with commas, as Shopify does", () => {
    const base = { shop: "shop-name.myshopify.com", logged_in_customer_id: "1", path_prefix: "/apps/awesome_reviews", timestamp: "1317327555" };
    const signature = signProxyParams({ ...base, extra: "1,2" }, SECRET).get("signature")!;
    const received = new URLSearchParams({ ...base, signature });
    received.append("extra", "1");
    received.append("extra", "2");
    expect(verifyProxySignature(received, SECRET)).toBe(true);
  });
});

describe("storefront chat helpers", () => {
  it("normalizes order numbers", () => {
    expect(normalizeOrderName("1001")).toBe("#1001");
    expect(normalizeOrderName("#1001")).toBe("#1001");
    expect(normalizeOrderName(" order 1001 ")).toBe("#1001");
    expect(normalizeOrderName("!!")).toBeNull();
  });

  it("only accepts well-formed visitor secrets, and never stores them in the clear", () => {
    expect(visitorHash("short")).toBeNull();
    expect(visitorHash("<script>alert(1)</script>aaaaaaaaaaaaaaaa")).toBeNull();
    const h = visitorHash("a".repeat(48));
    expect(h).toMatch(/^[0-9a-f]{64}$/);
    expect(h).not.toContain("aaaa");
  });
});
