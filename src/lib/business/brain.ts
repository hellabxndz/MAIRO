import { z } from "zod";
import { db } from "@/lib/db";
import type { AdGoal } from "@/generated/prisma/enums";
import type { FactMeta, FactSource } from "@/lib/brain/catalog";

// The Mairo Business Brain: what MAIRO knows about a business, in one place.
//
// Filled by the Business Analyzer from the business's own website and edited
// by the business under Settings > Business Brain. Every campaign, ad and
// recommendation reads from here, so a business answers each question once.
//
// Honesty rules, the same as everywhere else in MAIRO:
//   - Nothing is invented. A field the website didn't show stays empty, and
//     an empty field is shown as "Not found" rather than filled with a guess.
//   - What the business typed wins. A field they edited is listed in
//     editedFields and a fresh analysis never overwrites it.
//   - Results aren't stored here as claims. "What has worked" is read from
//     real campaign figures when it's shown (see learnedFromCampaigns).

const list = z.array(z.string().trim().min(1).max(300)).max(30).default([]);
const text = z.string().trim().max(2000).default("");

const level = z.enum(["high", "normal", "low"]).nullable().default(null);

export const productSchema = z.object({
  name: z.string().trim().min(1).max(200),
  /** As shown on the site, e.g. "$49" or "From $120". Null when no price was shown. */
  price: z.string().trim().max(60).nullable().default(null),
  category: z.string().trim().max(120).nullable().default(null),
  notes: z.string().trim().max(400).nullable().default(null),
  /** A product someone buys, or a service someone books. Null when unknown. */
  kind: z.enum(["product", "service"]).nullable().default(null),
  /** How much the business wants to sell it now — only as the owner said. */
  priority: level,
  /** How profitable it is — only when the owner says; never guessed. */
  profitability: level,
  /** available, or unavailable (sold out), seasonal, or new. Null: not said. */
  status: z.enum(["available", "unavailable", "seasonal", "new"]).nullable().default(null),
  /** What the business wants from it right now, e.g. "Increase bookings". */
  goal: z.string().trim().max(160).nullable().default(null),
});

export const profileSchema = z.object({
  businessName: text,
  industry: text,
  website: text,
  overview: text,
  /** Where the business is, as the owner says it (a town, an address). */
  location: text,
  /** "local", "online" or "both". Empty: not known. */
  presence: z.enum(["", "local", "online", "both"]).default(""),
  /** Only when the owner says. */
  yearsInBusiness: text,
  /** What the owner wants to sell more of right now (a product or service). */
  focusItem: text,
  products: z.array(productSchema).max(40).default([]),
  offers: list,
  discounts: list,
  /** An estimate the business can correct, e.g. "$40–$60". Empty when unknowable. */
  averageOrderValue: text,
  targetCustomer: text,
  brandColors: z.array(z.string().trim().regex(/^#[0-9a-fA-F]{3,8}$/)).max(8).default([]),
  brandStyle: text,
  brandVoice: text,
  primaryCta: text,
  categories: list,
  bestProducts: list,
  painPoints: list,
  desires: list,
  usps: list,
  competitorCategory: text,
  opportunities: list,
  mainGoals: text,
  successfulOffers: list,
  unsuccessfulOffers: list,
  // Learned from the owner's answers in the Campaign Review ("Help MAIRO learn
  // your business"). Long-term facts only — a sale or a deadline belongs to
  // one campaign and is kept on that campaign, never here.
  /** The strongest results customers get, in the owner's words. */
  customerResults: list,
  /** Why people hesitate or don't buy, and what they misunderstand. */
  objections: list,
  /** What customers compliment most. */
  customerPraise: list,
  /** Where most customers are. */
  serviceArea: text,
  /** The age range that buys most often, as the owner put it. */
  customerAges: text,
  /** The customers worth the most to the business. */
  bestCustomers: text,
  /** People the owner doesn't want to reach. */
  excludedCustomers: text,
  /** The products or services that make the most money. */
  mostProfitable: text,
  /** Material the business has for ads: product photos, before/after, testimonials… */
  creativeAssets: list,
  // Customer profile, beyond who buys: only what the owner said or connected
  // data supports — never assumed demographics.
  customerTypes: list,
  customerInterests: list,
  purchaseConsiderations: list,
  repeatBehavior: text,
  // Brand: how creatives should look and sound, and what to never say.
  creativeStyle: text,
  logoUrl: text,
  fonts: list,
  preferredWording: list,
  /** Words and claims to avoid, e.g. "cheap-looking discount graphics". */
  avoidClaims: list,
  brandGuidelines: text,
  /** Campaign Review questions the owner answered "no" to, so they aren't asked every campaign. */
  declinedQuestions: list,
  /** Gross margin, when the business tells MAIRO. Used for profit on the dashboard. */
  profitMarginPercent: z.number().min(0).max(100).nullable().default(null),
});

export type BrainProfile = z.infer<typeof profileSchema>;
export type BrainProduct = z.infer<typeof productSchema>;

/** A product or service record with every optional detail left unset. */
export function newProduct(p: Pick<BrainProduct, "name"> & Partial<BrainProduct>): BrainProduct {
  return { price: null, category: null, notes: null, kind: null, priority: null, profitability: null, status: null, goal: null, ...p };
}
export type BrainField = keyof BrainProfile;

export const EMPTY_PROFILE: BrainProfile = profileSchema.parse({});

/** The analysis sections that aren't part of the editable profile. */
export const analysisSchema = z.object({
  strongestOffer: z.object({ offer: z.string(), why: z.string() }).nullable().default(null),
  conversionIssues: z
    .array(
      z.object({
        issue: z.string(),
        why: z.string(),
        fix: z.string(),
        severity: z.enum(["high", "medium", "low"]),
      }),
    )
    .default([]),
  strategy: z
    .object({
      primaryProduct: z.string(),
      audience: z.string(),
      angle: z.string(),
      platform: z.string(),
      secondaryPlatform: z.string().nullable(),
      budgetPerDayDollars: z.number().min(5).max(1000),
      budgetReason: z.string(),
      goal: z.enum(["SALES", "LEADS", "TRAFFIC", "AWARENESS", "ENGAGEMENT", "APP_PROMOTION"]),
      campaignLabel: z.string(),
      creative: z.string(),
      promotes: z.enum(["BUSINESS", "PRODUCT", "SERVICE", "OFFER"]).nullable().default(null),
    })
    .nullable()
    .default(null),
  /** Pages read, so the business can see what the analysis was based on. */
  pagesRead: z.array(z.string()).default([]),
  /** False when the AI wasn't available and only the page facts were read. */
  aiUsed: z.boolean().default(false),
  note: z.string().nullable().default(null),
});

export type BrainAnalysis = z.infer<typeof analysisSchema>;

/** A fact that used to be true — "Previously offered window tinting". Never read as current. */
export type HistoricalFact = { field: string; text: string; until: string; source: FactSource };

export type BrainRecord = {
  profile: BrainProfile;
  editedFields: string[];
  /** Where each fact came from and when it was last confirmed. */
  meta: Record<string, FactMeta>;
  history: HistoricalFact[];
  updatedAt: Date;
  analysis: BrainAnalysis | null;
  analyzedUrl: string | null;
  analyzedAt: Date | null;
};

function parseJson<T>(raw: string | null | undefined, schema: z.ZodType<T>): T | null {
  if (!raw) return null;
  try {
    const parsed = schema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

function parseLoose<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback;
  try {
    const v = JSON.parse(raw) as unknown;
    return (Array.isArray(fallback) ? (Array.isArray(v) ? v : fallback) : v && typeof v === "object" && !Array.isArray(v) ? v : fallback) as T;
  } catch {
    return fallback;
  }
}

/**
 * The brain for a business, filled in from what it already told MAIRO when
 * nothing has been analyzed yet — so a business that answered at signup
 * doesn't face an empty page.
 */
export async function loadBrain(organizationId: string): Promise<BrainRecord> {
  const [row, org, intake] = await Promise.all([
    db.businessBrain.findUnique({ where: { organizationId } }),
    db.organization.findUnique({ where: { id: organizationId }, select: { name: true, industry: true, website: true } }),
    db.onboardingIntake.findUnique({ where: { organizationId } }),
  ]);
  const stored = parseJson(row?.profileJson, profileSchema);
  const fallback: BrainProfile = {
    ...EMPTY_PROFILE,
    businessName: org?.name ?? "",
    industry: org?.industry ?? "",
    website: org?.website ?? "",
    overview: intake?.offering ?? "",
    targetCustomer: intake?.targetAudience ?? "",
    brandVoice: intake?.brandVoice ?? "",
    usps: intake?.differentiator ? [intake.differentiator] : [],
    competitorCategory: intake?.competitors ?? "",
  };
  return {
    profile: stored ? { ...fallback, ...withoutEmpty(stored) } : fallback,
    editedFields: row?.editedFields ?? [],
    meta: parseLoose<Record<string, FactMeta>>(row?.factsJson, {}),
    history: parseLoose<HistoricalFact[]>(row?.historyJson, []),
    updatedAt: row?.updatedAt ?? new Date(0),
    analysis: parseJson(row?.analysisJson, analysisSchema),
    analyzedUrl: row?.analyzedUrl ?? null,
    analyzedAt: row?.analyzedAt ?? null,
  };
}

/** Drops empty values so they don't hide a fallback that has something. */
function withoutEmpty(p: BrainProfile): Partial<BrainProfile> {
  const out: Partial<BrainProfile> = {};
  for (const [k, v] of Object.entries(p) as [BrainField, unknown][]) {
    if (v === "" || v === null || (Array.isArray(v) && v.length === 0)) continue;
    (out as Record<string, unknown>)[k] = v;
  }
  return out;
}

/**
 * Merges a fresh analysis into the stored profile.
 *
 * Fields the business edited by hand are kept. Everything else takes the new
 * value when the analysis found one, and keeps the old one when it didn't —
 * a page that didn't mention prices this time doesn't erase the prices.
 */
export function mergeAnalysis(current: BrainProfile, found: Partial<BrainProfile>, edited: string[]): BrainProfile {
  const next: BrainProfile = { ...current };
  for (const [k, v] of Object.entries(found) as [BrainField, unknown][]) {
    if (edited.includes(k)) continue;
    if (v === "" || v === null || v === undefined || (Array.isArray(v) && v.length === 0)) continue;
    (next as Record<string, unknown>)[k] = v;
  }
  return profileSchema.parse(next);
}

export async function saveBrain(
  organizationId: string,
  input: {
    profile: BrainProfile;
    editedFields?: string[];
    analysis?: BrainAnalysis | null;
    analyzedUrl?: string | null;
    analyzedAt?: Date | null;
    meta?: Record<string, FactMeta>;
    history?: HistoricalFact[];
  },
): Promise<void> {
  const profileJson = JSON.stringify(profileSchema.parse(input.profile));
  const data = {
    profileJson,
    ...(input.editedFields ? { editedFields: input.editedFields } : {}),
    ...(input.analysis !== undefined ? { analysisJson: input.analysis ? JSON.stringify(input.analysis) : null } : {}),
    ...(input.analyzedUrl !== undefined ? { analyzedUrl: input.analyzedUrl } : {}),
    ...(input.analyzedAt !== undefined ? { analyzedAt: input.analyzedAt } : {}),
    ...(input.meta ? { factsJson: JSON.stringify(input.meta) } : {}),
    ...(input.history ? { historyJson: JSON.stringify(input.history.slice(-60)) } : {}),
  };
  await db.businessBrain.upsert({
    where: { organizationId },
    create: { organizationId, ...data },
    update: data,
  });

  // The older places campaigns read from, filled where they're empty, so the
  // Create wizard and Mairo Memory pick the brain up without a second source.
  const p = input.profile;
  const [org, intake] = await Promise.all([
    db.organization.findUnique({ where: { id: organizationId }, select: { website: true, industry: true } }),
    db.onboardingIntake.findUnique({ where: { organizationId } }),
  ]);
  await db.organization.update({
    where: { id: organizationId },
    data: {
      ...(!org?.website?.trim() && p.website ? { website: p.website } : {}),
      ...(!org?.industry?.trim() && p.industry ? { industry: p.industry } : {}),
    },
  });
  if (intake) {
    await db.onboardingIntake.update({
      where: { organizationId },
      data: {
        ...(!intake.offering?.trim() && p.overview ? { offering: p.overview.slice(0, 1000) } : {}),
        ...(!intake.targetAudience?.trim() && p.targetCustomer ? { targetAudience: p.targetCustomer.slice(0, 1000) } : {}),
        ...(!intake.brandVoice?.trim() && p.brandVoice ? { brandVoice: p.brandVoice.slice(0, 500) } : {}),
        ...(!intake.differentiator?.trim() && p.usps[0] ? { differentiator: p.usps.slice(0, 3).join("; ") } : {}),
      },
    });
  }
}

/**
 * The facts an ad may be written from, in one paragraph each.
 *
 * Used wherever MAIRO writes words for this business, so a new ad version, a
 * fixed headline and a fresh campaign all sound like the same company.
 */
export function brainFacts(p: BrainProfile): {
  offering: string;
  targetAudience: string;
  differentiator: string;
  voice: string;
} {
  const products = p.products
    .slice(0, 6)
    .map((x) => (x.price ? `${x.name} (${x.price})` : x.name))
    .join(", ");
  return {
    offering: [p.overview, products ? `Products: ${products}.` : "", p.offers.length ? `Current offers: ${p.offers.join("; ")}.` : ""]
      .filter(Boolean)
      .join(" "),
    targetAudience: p.targetCustomer,
    differentiator: p.usps.join("; "),
    voice: [p.brandVoice, p.brandStyle].filter(Boolean).join(". "),
  };
}

/** One line per area for the assistant's prompt. Says what's missing too. */
export function brainBrief(p: BrainProfile): string {
  const line = (label: string, value: string | string[]) => {
    const v = Array.isArray(value) ? value.join("; ") : value;
    return `- ${label}: ${v.trim() ? v.slice(0, 400) : "not known"}`;
  };
  const known = (label: string, value: string | string[]) => ((Array.isArray(value) ? value.length : value.trim()) ? [line(label, value)] : []);
  const item = (x: BrainProduct) =>
    [
      x.name,
      x.price,
      x.kind === "service" ? "service" : null,
      x.priority === "high" ? "priority" : null,
      x.profitability === "high" ? "high margin" : null,
      x.status && x.status !== "available" ? x.status.toUpperCase() : null,
      x.goal ? `goal: ${x.goal}` : null,
    ]
      .filter(Boolean)
      .join(" · ");
  return [
    "The Business Brain (what this business has told MAIRO or MAIRO read from its website; never add to it):",
    line("Overview", p.overview),
    ...known("Industry", p.industry),
    ...known("Location", [p.location, p.serviceArea, p.presence ? `${p.presence} business` : ""].filter(Boolean).join(" · ")),
    line("Products and services", p.products.slice(0, 10).map(item)),
    ...known("Focus right now", p.focusItem),
    ...known("Best sellers", p.bestProducts),
    ...known("Most profitable", p.mostProfitable),
    line("Standing offers", p.offers),
    line("Target customer", p.targetCustomer),
    ...known("Customer types", p.customerTypes),
    ...known("Customer problems", p.painPoints),
    ...known("What customers want", p.desires),
    ...known("Why customers hesitate", p.objections),
    ...known("Results customers get", p.customerResults),
    ...known("What customers praise", p.customerPraise),
    line("What makes them different", p.usps),
    line("Brand voice", p.brandVoice),
    ...known("Visual direction", [p.brandStyle, p.creativeStyle].filter(Boolean).join(". ")),
    ...known("Preferred wording", p.preferredWording),
    ...known("NEVER say or show", p.avoidClaims),
    ...known("Material they have for ads", p.creativeAssets),
    line("Main goals", p.mainGoals),
    line("Offers that worked", p.successfulOffers),
    line("Offers that didn't", p.unsuccessfulOffers),
  ].join("\n");
}

/** The campaign goal an analysis recommends, for the Create wizard. */
export function goalOf(analysis: BrainAnalysis | null): AdGoal | null {
  return analysis?.strategy?.goal ?? null;
}

/**
 * Trims anything the AI or a form sent to the lengths the profile allows, so
 * a long answer is shortened rather than the whole analysis being refused.
 */
export function sanitizeProfile(input: Partial<Record<BrainField, unknown>>): Partial<BrainProfile> {
  const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : undefined);
  const strs = (v: unknown) =>
    Array.isArray(v)
      ? v.filter((x): x is string => typeof x === "string" && x.trim().length > 0).map((x) => x.trim().slice(0, 300)).slice(0, 30)
      : undefined;
  const out: Partial<BrainProfile> = {};
  for (const [k, v] of Object.entries(input) as [BrainField, unknown][]) {
    if (v === undefined) continue;
    switch (k) {
      case "products":
        if (Array.isArray(v)) {
          out.products = v
            .filter((p): p is Record<string, unknown> => Boolean(p) && typeof p === "object" && typeof (p as { name?: unknown }).name === "string")
            .map((p) => ({
              name: String(p.name).trim().slice(0, 200) || "Unnamed",
              price: typeof p.price === "string" && p.price.trim() ? p.price.trim().slice(0, 60) : null,
              category: typeof p.category === "string" && p.category.trim() ? p.category.trim().slice(0, 120) : null,
              notes: typeof p.notes === "string" && p.notes.trim() ? p.notes.trim().slice(0, 400) : null,
              kind: p.kind === "product" || p.kind === "service" ? (p.kind as BrainProduct["kind"]) : null,
              priority: p.priority === "high" || p.priority === "normal" || p.priority === "low" ? (p.priority as BrainProduct["priority"]) : null,
              profitability: p.profitability === "high" || p.profitability === "normal" || p.profitability === "low" ? (p.profitability as BrainProduct["profitability"]) : null,
              status: p.status === "available" || p.status === "unavailable" || p.status === "seasonal" || p.status === "new" ? (p.status as BrainProduct["status"]) : null,
              goal: typeof p.goal === "string" && p.goal.trim() ? p.goal.trim().slice(0, 160) : null,
            }))
            .slice(0, 40);
        }
        break;
      case "brandColors":
        if (Array.isArray(v)) out.brandColors = v.filter((c): c is string => typeof c === "string" && /^#[0-9a-fA-F]{3,8}$/.test(c.trim())).map((c) => c.trim()).slice(0, 8);
        break;
      case "presence":
        out.presence = v === "local" || v === "online" || v === "both" ? v : "";
        break;
      case "profitMarginPercent":
        out.profitMarginPercent = typeof v === "number" && Number.isFinite(v) ? Math.min(100, Math.max(0, v)) : null;
        break;
      case "offers":
      case "discounts":
      case "categories":
      case "bestProducts":
      case "painPoints":
      case "desires":
      case "usps":
      case "opportunities":
      case "successfulOffers":
      case "unsuccessfulOffers":
      case "customerResults":
      case "objections":
      case "customerPraise":
      case "creativeAssets":
      case "declinedQuestions":
      case "customerTypes":
      case "customerInterests":
      case "purchaseConsiderations":
      case "fonts":
      case "preferredWording":
      case "avoidClaims": {
        const list = strs(v);
        if (list) out[k] = list;
        break;
      }
      default: {
        const s = str(v, 2000);
        if (s !== undefined) (out as Record<string, unknown>)[k] = s;
      }
    }
  }
  return out;
}
