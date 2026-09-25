import { describe, expect, it } from "vitest";
import { encodeForm, signStripePayload, verifyStripeSignature } from "./stripe";

describe("Stripe webhook signatures", () => {
  const body = JSON.stringify({ id: "evt_1", type: "invoice.paid" });
  it("accepts a correctly signed, recent payload", () => {
    expect(verifyStripeSignature(body, signStripePayload(body, "whsec_x"), "whsec_x")).toBe(true);
  });
  it("rejects tampering, wrong secrets, missing headers and old timestamps", () => {
    const header = signStripePayload(body, "whsec_x");
    expect(verifyStripeSignature(body.replace("paid", "void"), header, "whsec_x")).toBe(false);
    expect(verifyStripeSignature(body, header, "whsec_y")).toBe(false);
    expect(verifyStripeSignature(body, null, "whsec_x")).toBe(false);
    const old = signStripePayload(body, "whsec_x", Math.floor(Date.now() / 1000) - 3600);
    expect(verifyStripeSignature(body, old, "whsec_x")).toBe(false);
  });
  it("accepts any of several v1 signatures (secret rotation)", () => {
    const good = signStripePayload(body, "whsec_x");
    const t = good.split(",")[0];
    expect(verifyStripeSignature(body, `${t},v1=deadbeef,${good.split(",")[1]}`, "whsec_x")).toBe(true);
  });
});

describe("form encoding", () => {
  it("flattens nested params the way Stripe expects", () => {
    const f = encodeForm({ mode: "subscription", line_items: [{ price: "p1", quantity: 1 }], metadata: { a: "b" }, expand: ["subscription"], skip: undefined });
    expect(f.toString()).toBe(
      "mode=subscription&line_items%5B0%5D%5Bprice%5D=p1&line_items%5B0%5D%5Bquantity%5D=1&metadata%5Ba%5D=b&expand%5B0%5D=subscription",
    );
  });
});
