import { describe, expect, it } from "vitest";
import { redactForAudit } from "./tools-server";

describe("tool audit redaction", () => {
  it("masks emails anywhere in the input", () => {
    expect(redactForAudit({ email: "Jane@Shop.com", nested: ["write to a@b.co"], n: 1 })).toEqual({ email: "[email]", nested: ["write to [email]"], n: 1 });
  });
});
