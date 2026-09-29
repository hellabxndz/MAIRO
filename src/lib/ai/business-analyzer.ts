import { generateObject } from "ai";
import { z } from "zod";
import { agentModel } from "@/lib/ai/model";
import type { SiteFacts } from "@/lib/business/site-facts";

// The Business Analyzer's reading of a website.
//
// The model is given only what MAIRO read off the pages, and told that an
// empty answer is better than a guess. Prices and offers are then checked
// against the page text by the caller: a price the page never showed is
// dropped rather than stored in the Business Brain as fact.

const productSchema = z.object({
  name: z.string(),
  price: z.string().nullable().describe("Exactly as shown on the page, or null"),
  category: z.string().nullable(),
  notes: z.string().nullable(),
});

const schema = z.object({
  businessName: z.string(),
  industry: z.string(),
  overview: z.string().describe("Two or three plain sentences: what the business is and does"),
  products: z.array(productSchema).max(15),
  offers: z.array(z.string()).max(8).describe("Offers stated on the site (free shipping, a bundle…). Empty if none."),
  discounts: z.array(z.string()).max(8).describe("Discounts stated on the site. Empty if none."),
  averageOrderValue: z.string().describe("A rough range from the prices shown, e.g. \"$40–$60\", or empty if prices aren't shown"),
  targetCustomer: z.string(),
  brandStyle: z.string().describe("How the site looks, in a few words"),
  brandVoice: z.string().describe("How the site talks, in a few words"),
  primaryCta: z.string().describe("The main thing the site asks visitors to do"),
  categories: z.array(z.string()).max(10),
  bestProducts: z.array(z.string()).max(5).describe("The products or services best suited to advertise first, from what's on the site"),
  painPoints: z.array(z.string()).max(6),
  desires: z.array(z.string()).max(6),
  usps: z.array(z.string()).max(6).describe("What makes it different, only as the site claims it"),
  competitorCategory: z.string().describe("The kind of business it competes with, e.g. \"online running-shoe retailers\""),
  opportunities: z.array(z.string()).max(6).describe("Advertising opportunities on Facebook and Instagram"),
  strongestOffer: z.object({ offer: z.string(), why: z.string() }).nullable(),
  conversionIssues: z
    .array(z.object({ issue: z.string(), why: z.string(), fix: z.string(), severity: z.enum(["high", "medium", "low"]) }))
    .max(6)
    .describe("Things on the site likely to stop people who arrive from an ad buying or enquiring"),
  strategy: z.object({
    primaryProduct: z.string(),
    audience: z.string(),
    angle: z.string(),
    placement: z.string().describe("Where on Facebook and Instagram to lean on, e.g. \"Instagram Reels and Stories\""),
    budgetPerDayDollars: z.number().min(5).max(500),
    budgetReason: z.string(),
    goal: z.enum(["SALES", "LEADS", "TRAFFIC", "AWARENESS", "ENGAGEMENT", "APP_PROMOTION"]),
    campaignLabel: z.string().describe("e.g. \"Purchase conversion campaign\""),
    creative: z.string().describe("The kind of ad to make first"),
    promotes: z.enum(["BUSINESS", "PRODUCT", "SERVICE", "OFFER"]),
  }),
});

export type AiBusinessAnalysis = z.infer<typeof schema>;

const SYSTEM = [
  "You analyse a small business's website so an advertising assistant can run its Facebook and Instagram ads.",
  "",
  "Hard rules:",
  "- Use ONLY the page content provided. Never invent products, prices, discounts, offers, reviews, awards or numbers.",
  "- If something isn't on the pages, leave it empty (empty string, empty list, or null). An empty answer is correct; a guess is wrong.",
  "- Prices must be copied exactly as written on the page.",
  "- The advertising runs on Meta only (Facebook and Instagram). Recommend placements within those, never another network.",
  "- The budget is a sensible starting point for learning what works, not a promise of results. Explain it in one sentence based on the price point.",
  "- Never promise or estimate revenue, sales or return.",
  "- Write in plain, friendly English for a business owner who isn't an advertiser.",
].join("\n");

function describePage(f: SiteFacts): string {
  return [
    `URL: ${f.url}`,
    f.title ? `Title: ${f.title}` : "",
    f.siteName ? `Site name: ${f.siteName}` : "",
    f.description ? `Description: ${f.description}` : "",
    f.headings.length ? `Headings: ${f.headings.join(" | ")}` : "",
    f.products.length ? `Products (structured data): ${f.products.map((p) => `${p.name}${p.price ? ` ${p.price}` : ""}`).join("; ")}` : "",
    f.prices.length ? `Prices on the page: ${f.prices.join(", ")}` : "",
    f.ctas.length ? `Buttons: ${f.ctas.join(" | ")}` : "",
    `Text: ${f.text.slice(0, 5000)}`,
  ]
    .filter(Boolean)
    .join("\n");
}

export async function analyzeWithAi(pages: SiteFacts[]): Promise<AiBusinessAnalysis> {
  const { object } = await generateObject({
    model: agentModel,
    schema,
    system: SYSTEM,
    prompt: `Here is what was read from the business's website.\n\n${pages.map(describePage).join("\n\n---\n\n")}`,
  });
  return object;
}
