import { describe, expect, it } from "vitest";
import { likePattern, orValue } from "@/lib/search";
import { aiEmployeeConfigSchema, parseAiConfig } from "./ai-employee";
import { signUpSchema } from "./auth";
import { aiNameSchema, businessInfoSchema, goalsSchema, sellsSchema } from "./business";

describe("auth validation", () => {
  it("normalizes email and enforces password strength", () => {
    const ok = signUpSchema.safeParse({ fullName: " Ana ", email: " Ana@Example.COM ", password: "longenough1", confirmPassword: "longenough1" });
    expect(ok.success && ok.data.email).toBe("ana@example.com");
    expect(signUpSchema.safeParse({ fullName: "A", email: "a@b.co", password: "short1" }).success).toBe(false);
    expect(signUpSchema.safeParse({ fullName: "A", email: "a@b.co", password: "onlyletterszz" }).success).toBe(false);
    expect(signUpSchema.safeParse({ fullName: "A", email: "not-an-email", password: "longenough1" }).success).toBe(false);
  });
});

describe("business validation", () => {
  it("adds https to bare domains and rejects other schemes", () => {
    const r = businessInfoSchema.safeParse({ name: "Acme", websiteUrl: "acme.com", industry: "Pets", description: "" });
    expect(r.success && r.data.websiteUrl).toBe("https://acme.com");
    expect(businessInfoSchema.safeParse({ name: "Acme", websiteUrl: "javascript:alert(1)", industry: "Pets" }).success).toBe(false);
    const empty = businessInfoSchema.safeParse({ name: "Acme", websiteUrl: "", industry: "Pets" });
    expect(empty.success && empty.data.websiteUrl).toBeUndefined();
  });
  it("only accepts known industries, sells and goals", () => {
    expect(businessInfoSchema.safeParse({ name: "Acme", websiteUrl: "", industry: "Crime" }).success).toBe(false);
    expect(sellsSchema.safeParse({ sells: [] }).success).toBe(false);
    expect(sellsSchema.safeParse({ sells: ["weapons"] }).success).toBe(false);
    const g = goalsSchema.safeParse({ goals: ["order_tracking", "order_tracking"] });
    expect(g.success && g.data.goals).toEqual(["order_tracking"]);
  });
  it("keeps AI names short and plain", () => {
    expect(aiNameSchema.safeParse({ name: "Nova" }).success).toBe(true);
    expect(aiNameSchema.safeParse({ name: "Zoë-Anne" }).success).toBe(true);
    expect(aiNameSchema.safeParse({ name: "<script>" }).success).toBe(false);
    expect(aiNameSchema.safeParse({ name: "x".repeat(41) }).success).toBe(false);
  });
});

describe("AI employee config", () => {
  it("fills safe defaults and falls back when stored JSON is corrupt", () => {
    const d = parseAiConfig({});
    expect(d.personality).toBe("friendly");
    expect(d.escalation.offerHumanWhenUpset).toBe(true);
    expect(parseAiConfig({ personality: "evil", brandColor: "red" }).personality).toBe("friendly");
    expect(parseAiConfig(null).bubblePosition).toBe("bottom-right");
  });
  it("only allows https logos and hex colors", () => {
    expect(aiEmployeeConfigSchema.safeParse({ logoUrl: "http://x.com/a.png" }).success).toBe(false);
    expect(aiEmployeeConfigSchema.safeParse({ brandColor: "#12345g" }).success).toBe(false);
  });
});

describe("search escaping", () => {
  it("escapes LIKE wildcards", () => {
    expect(likePattern("50%_off\\")).toBe("%50\\%\\_off\\\\%");
  });
  it("quotes values for PostgREST or() filters", () => {
    expect(orValue('a,b)"c')).toBe('"a,b)\\"c"');
  });
});
