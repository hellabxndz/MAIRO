import { z } from "zod";
import { db } from "@/lib/db";
import type { AdGoal } from "@/generated/prisma/enums";

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

export const productSchema = z.object({
  name: z.string().trim().min(1).max(200),
  /** As shown on the site, e.g. "$49" or "From $120". Null when no price was shown. */
  price: z.string().trim().max(60).nullable().default(null),
  category: z.string().trim().max(120).nullable().default(null),
  notes: z.string().trim().max(400).nullable().default(null),
});

export const profileSchema = z.object({
  businessName: text,
  industry: text,
  website: text,
  overview: text,
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
  /** Gross margin, when the business tells MAIRO. Used for profit on the dashboard. */
  profitMarginPercent: z.number().min(0).max(100).nullable().default(null),
});

export type BrainProfile = z.infer<typeof profileSchema>;
export type BrainProduct = z.infer<typeof productSchema>;
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

export type BrainRecord = {
  profile: BrainProfile;
  editedFields: string[];
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
  },
): Promise<void> {
  const profileJson = JSON.stringify(profileSchema.parse(input.profile));
  const data = {
    profileJson,
    ...(input.editedFields ? { editedFields: input.editedFields } : {}),
    ...(input.analysis !== undefined ? { analysisJson: input.analysis ? JSON.stringify(input.analysis) : null } : {}),
    ...(input.analyzedUrl !== undefined ? { analyzedUrl: input.analyzedUrl } : {}),
    ...(input.analyzedAt !== undefined ? { analyzedAt: input.analyzedAt } : {}),
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
  return [
    "The Business Brain (what this business has told MAIRO or MAIRO read from its website; never add to it):",
    line("Overview", p.overview),
    line("Products", p.products.slice(0, 8).map((x) => (x.price ? `${x.name} ${x.price}` : x.name))),
    line("Offers", p.offers),
    line("Target customer", p.targetCustomer),
    line("Brand voice", p.brandVoice),
    line("What makes them different", p.usps),
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
            }))
            .slice(0, 40);
        }
        break;
      case "brandColors":
        if (Array.isArray(v)) out.brandColors = v.filter((c): c is string => typeof c === "string" && /^#[0-9a-fA-F]{3,8}$/.test(c.trim())).map((c) => c.trim()).slice(0, 8);
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
      case "unsuccessfulOffers": {
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
