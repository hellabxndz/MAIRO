// The free tools: one registry for the /tools hub, each tool page, the landing
// page's selection and the capability matrix (src/lib/capabilities.ts).
//
// A tool is listed as usable only when its workflow is built and checked. A
// tool that isn't gets no page (no thin placeholders in search results) and
// is shown in the hub as "not available yet" with the reason.
//
// `processing` is what the page tells the visitor about where their inputs go:
//   browser — calculated on their device; nothing is sent anywhere.
//   server  — MAIRO's server fetches public pages on their behalf.
//   ai      — sent to MAIRO's server and an AI provider to write the result.

export type ToolCategory = "Creative" | "Website" | "Research" | "Numbers" | "Tracking";
export const TOOL_CATEGORIES: ToolCategory[] = ["Creative", "Website", "Research", "Numbers", "Tracking"];

export type ToolStatus = "working" | "partial" | "unavailable";

export type Tool = {
  slug: string;
  name: string;
  category: ToolCategory;
  status: ToolStatus;
  /** One sentence for the card and the page description. */
  summary: string;
  /** For partial: what has to be true for it to work. */
  condition?: string;
  processing: "browser" | "server" | "ai";
  /** Search words beyond the name. */
  keywords: string[];
  evidence: string[];
  needs: string[];
  checks: string[];
  verify: string;
  /** Shown on the landing page (only working tools are). */
  featured?: boolean;
};

const REGISTRY = "src/lib/tools/registry.ts";

export const TOOLS: Tool[] = [
  // --- Numbers ---------------------------------------------------------------
  {
    slug: "break-even-roas",
    name: "Break-even ROAS calculator",
    category: "Numbers",
    status: "unavailable",
    summary: "The return on ad spend you need before ads stop losing money on each sale — before fixed costs.",
    processing: "browser",
    keywords: ["roas", "return on ad spend", "break even", "profit"],
    evidence: [REGISTRY],
    needs: [],
    checks: [],
    verify: "$100 sale with $60 variable costs gives $40 contribution and 2.5x break-even ROAS.",
  },
  {
    slug: "margin-markup",
    name: "Margin and markup calculator",
    category: "Numbers",
    status: "unavailable",
    summary: "Turn a cost and a price into margin and markup — and see why they're different numbers.",
    processing: "browser",
    keywords: ["margin", "markup", "price", "cost", "gross profit"],
    evidence: [REGISTRY],
    needs: [],
    checks: [],
    verify: "Margin divides by price, markup by cost; zero and negative inputs explained.",
  },
  {
    slug: "ad-roi",
    name: "Ad return scenario calculator",
    category: "Numbers",
    status: "unavailable",
    summary: "Model clicks, orders or jobs, and what's left after ad spend, from your own cost-per-click and conversion assumptions.",
    processing: "browser",
    keywords: ["roi", "return", "cpc", "conversion rate", "scenario"],
    evidence: [REGISTRY],
    needs: [],
    checks: [],
    verify: "Modeled clicks = budget / CPC; orders = clicks × rate; contribution after ad spend = orders × contribution − spend.",
  },
  {
    slug: "customer-lifetime-value",
    name: "Customer lifetime contribution calculator",
    category: "Numbers",
    status: "unavailable",
    summary: "What a customer contributes over a time horizon you choose, from their purchases and your margin — and the most you could pay to win one.",
    processing: "browser",
    keywords: ["ltv", "clv", "lifetime value", "repeat purchase", "cac"],
    evidence: [REGISTRY],
    needs: [],
    checks: [],
    verify: "Contribution-based, explicit horizon; affordable acquisition cost keeps the reserve you set.",
  },
  {
    slug: "monthly-profit",
    name: "Monthly operating profit calculator",
    category: "Numbers",
    status: "unavailable",
    summary: "Sales, variable costs, ad spend, fixed costs and software fees in one month — what's left, and what wasn't counted.",
    processing: "browser",
    keywords: ["profit", "monthly", "overhead", "fixed costs", "p&l"],
    evidence: [REGISTRY],
    needs: [],
    checks: [],
    verify: "Every cost line shown; never called net profit when taxes and other costs are excluded.",
  },
  {
    slug: "service-lead-economics",
    name: "Cost-per-lead and booking calculator",
    category: "Numbers",
    status: "unavailable",
    summary: "For service businesses: the most you can pay per lead, from your job value, costs and how many leads book and buy.",
    processing: "browser",
    keywords: ["cost per lead", "cpl", "booking rate", "close rate", "service business", "jobs"],
    evidence: [REGISTRY],
    needs: [],
    checks: [],
    verify: "$400 contribution and 20% lead-to-sale gives $80 break-even CPL; a $100 reserve gives $60.",
  },
  {
    slug: "budget-planner",
    name: "Ad budget scenario planner",
    category: "Numbers",
    status: "unavailable",
    summary: "See what a daily budget can realistically test, how long learning takes at that level, and three scenarios from your own assumptions.",
    processing: "browser",
    keywords: ["budget", "daily budget", "how much to spend", "scenario"],
    evidence: [REGISTRY],
    needs: [],
    checks: [],
    verify: "Uses the plan's own budget thresholds; scenarios labelled as scenarios.",
  },
  {
    slug: "shopify-fees",
    name: "Shopify plan and fee comparison",
    category: "Numbers",
    status: "unavailable",
    summary: "Compare Shopify plans on subscription and card fees for your sales, with the rates' source and date shown and editable.",
    processing: "browser",
    keywords: ["shopify", "fees", "transaction fees", "shopify payments", "plans"],
    evidence: [REGISTRY],
    needs: [],
    checks: [],
    verify: "Rates carry a source URL and checked date; editable for country and plan.",
  },

  // --- Creative --------------------------------------------------------------
  {
    slug: "hook-generator",
    name: "Ad hook generator",
    category: "Creative",
    status: "unavailable",
    summary: "Opening lines for your ads from different angles — the problem, the result, an objection, the offer — built only from what you enter.",
    processing: "browser",
    keywords: ["hooks", "headlines", "ad copy", "angles", "opening line"],
    evidence: [REGISTRY],
    needs: [],
    checks: [],
    verify: "Each hook from a different angle; nothing claimed that wasn't entered.",
  },
  {
    slug: "creative-brief",
    name: "Creative brief and first-test planner",
    category: "Creative",
    status: "unavailable",
    summary: "A one-page brief for your first ad and a simple first test: one thing changed, what to measure, and when to decide.",
    processing: "browser",
    keywords: ["brief", "creative brief", "ad test", "a/b test", "first test"],
    evidence: [REGISTRY],
    needs: [],
    checks: [],
    verify: "One variable per test; decision rule stated before the test.",
  },
  {
    slug: "offer-clarity",
    name: "Offer clarity checker",
    category: "Creative",
    status: "unavailable",
    summary: "Paste your headline or offer and see which questions a stranger would still have — who it's for, what they get, what it costs, what to do next.",
    processing: "browser",
    keywords: ["offer", "headline", "value proposition", "clarity", "landing page copy"],
    evidence: [REGISTRY],
    needs: [],
    checks: [],
    verify: "Each finding quotes the text it's about; a rubric, not a conversion forecast.",
  },
  {
    slug: "ad-examples",
    name: "Ad examples by goal",
    category: "Creative",
    status: "unavailable",
    summary: "Original example ads written by MAIRO, organised by goal, format and business type — what each is trying to do and why.",
    processing: "browser",
    keywords: ["ad inspiration", "examples", "ad ideas", "templates"],
    evidence: [REGISTRY],
    needs: [],
    checks: [],
    verify: "Every example is MAIRO's own and labelled as an example, not a real business's ad.",
  },

  // --- Research --------------------------------------------------------------
  {
    slug: "offer-readiness",
    name: "Product and offer readiness checklist",
    category: "Research",
    status: "unavailable",
    summary: "Is this product or service ready to advertise? A checklist of margin, proof, delivery and page basics — not a prediction that it will sell.",
    processing: "browser",
    keywords: ["product research", "winning product", "readiness", "checklist"],
    evidence: [REGISTRY],
    needs: [],
    checks: [],
    verify: "Checklist score explained as a checklist, never as a likelihood of success.",
  },
  {
    slug: "competitor-ads",
    name: "Competitor ad research (guided)",
    category: "Research",
    status: "unavailable",
    summary: "A guided search of Meta's public Ad Library for a competitor, with a template for noting what you see — and what it can't tell you.",
    processing: "browser",
    keywords: ["competitor ads", "ad library", "spy", "research"],
    evidence: [REGISTRY],
    needs: [],
    checks: [],
    verify: "Clearly a guided search, not automated research; no spend or performance inferred.",
  },
  {
    slug: "competitor-website",
    name: "Competitor website comparison",
    category: "Research",
    status: "unavailable",
    summary: "Compare public pages side by side: offer, positioning, calls to action, prices shown and brand presentation.",
    processing: "server",
    keywords: ["competitor analysis", "compare websites", "positioning"],
    evidence: [REGISTRY],
    needs: [],
    checks: [],
    verify: "Only what's on the public pages, with the page it came from; no traffic or revenue invented.",
  },

  // --- Website ---------------------------------------------------------------
  {
    slug: "landing-page-audit",
    name: "Landing page audit",
    category: "Website",
    status: "unavailable",
    summary: "What a visitor from an ad would find on your page: the three changes that matter most, each with the evidence, then the full list.",
    processing: "server",
    keywords: ["landing page", "website audit", "conversion", "cta"],
    evidence: [REGISTRY],
    needs: [],
    checks: [],
    verify: "SSRF-safe fetch; every finding cites the page; unmeasured things say \"Not checked\".",
  },
  {
    slug: "shopify-app-detector",
    name: "Shopify app detector",
    category: "Website",
    status: "unavailable",
    summary: "Which apps a Shopify store shows publicly, with the evidence for each and what a public scan can't see.",
    processing: "server",
    keywords: ["shopify apps", "store apps", "detect"],
    evidence: [REGISTRY],
    needs: [],
    checks: [],
    verify: "Evidence per detection; \"not detected\" never presented as \"not installed\".",
  },
  {
    slug: "shopify-theme-detector",
    name: "Shopify theme detector",
    category: "Website",
    status: "unavailable",
    summary: "The theme a Shopify store uses, when it's publicly visible, with the evidence.",
    processing: "server",
    keywords: ["shopify theme", "theme detector"],
    evidence: [REGISTRY],
    needs: [],
    checks: [],
    verify: "Evidence shown; unknown when the theme isn't visible.",
  },

  // --- Tracking --------------------------------------------------------------
  {
    slug: "tracking-readiness",
    name: "Tracking readiness checker",
    category: "Tracking",
    status: "unavailable",
    summary: "Checks a page for the Meta pixel, Tag Manager and a consent banner, and says what that does and doesn't prove.",
    processing: "server",
    keywords: ["pixel", "meta pixel", "facebook pixel", "tracking", "gtm", "consent"],
    evidence: [REGISTRY],
    needs: [],
    checks: [],
    verify: "A detected script is never reported as working events.",
  },
  {
    slug: "utm-builder",
    name: "UTM link builder",
    category: "Tracking",
    status: "unavailable",
    summary: "Build tagged links for your ads so your analytics can tell which ad sent each visitor — with Meta's dynamic values when you want them.",
    processing: "browser",
    keywords: ["utm", "campaign url", "tracking link", "url builder"],
    evidence: [REGISTRY],
    needs: [],
    checks: [],
    verify: "Valid URL out; existing query kept; values encoded.",
  },
];

export function tool(slug: string): Tool | null {
  return TOOLS.find((t) => t.slug === slug) ?? null;
}

export function usable(t: Tool): boolean {
  return t.status === "working" || t.status === "partial";
}

export const USABLE_TOOLS = (): Tool[] => TOOLS.filter(usable);
