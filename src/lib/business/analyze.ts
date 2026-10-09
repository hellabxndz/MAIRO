import { recordRun } from "@/lib/team/runs";
import { newMeta } from "@/lib/brain/rules";
import { fetchPublicPage } from "@/lib/campaigns/landing-probe";
import { normalizeUrl } from "@/lib/campaigns/destination";
import { analyzeWithAi, type AiBusinessAnalysis } from "@/lib/ai/business-analyzer";
import { literalConversionIssues, readSiteFacts, type SiteFacts } from "./site-facts";
import {
  loadBrain,
  newProduct,
  mergeAnalysis,
  sanitizeProfile,
  saveBrain,
  type BrainAnalysis,
  type BrainProfile,
  type BrainRecord,
} from "./brain";

// Mairo Business Analyzer: read a business's website and turn it into a
// Business Brain.
//
// Reads the page the business gave plus up to three of its own shop, pricing
// or services pages, then asks the AI to make sense of it. Everything the AI
// says about prices and offers is checked against the page text first — a
// price the site never showed is dropped, not saved as fact. With no AI key,
// the page facts alone are saved and the page says so.

export type AnalyzeResult = { ok: true; brain: BrainRecord } | { ok: false; error: string };

/** Keeps only prices that literally appear in what was read. */
export function onlyShownPrices(analysis: AiBusinessAnalysis, pages: SiteFacts[]): AiBusinessAnalysis {
  const corpus = pages.map((p) => `${p.text} ${p.prices.join(" ")} ${p.products.map((x) => x.price ?? "").join(" ")}`).join(" ").replace(/\s+/g, "");
  const shown = (price: string | null) => {
    if (!price) return null;
    const digits = price.match(/\d+(?:[.,]\d+)?/g);
    return digits && digits.every((d) => corpus.includes(d)) ? price : null;
  };
  return {
    ...analysis,
    products: analysis.products.map((p) => ({ ...p, price: shown(p.price) })),
    averageOrderValue: analysis.averageOrderValue && /\d/.test(analysis.averageOrderValue) && !pages.some((p) => p.prices.length || p.products.some((x) => x.price))
      ? ""
      : analysis.averageOrderValue,
  };
}

function profileFromFacts(pages: SiteFacts[], url: string): Partial<BrainProfile> {
  const home = pages[0];
  const products = pages.flatMap((p) => p.products).slice(0, 20);
  return {
    businessName: home.siteName ?? home.title?.split(/[|–—-]/)[0]?.trim() ?? "",
    website: url,
    overview: home.description ?? "",
    products: products.map((p) => newProduct({ name: p.name, price: p.price })),
    brandColors: home.colors,
    primaryCta: home.ctas[0] ?? "",
  };
}

export async function analyzeBusiness(organizationId: string, rawUrl: string): Promise<AnalyzeResult> {
  const url = normalizeUrl(rawUrl);
  if (!url) return { ok: false, error: "That doesn't look like a web address. Try something like https://yourshop.com" };

  const home = await fetchPublicPage(url);
  if (!home.ok) return { ok: false, error: home.message };
  const pages: SiteFacts[] = [readSiteFacts(home.html, home.finalUrl)];
  for (const link of pages[0].keyLinks) {
    const page = await fetchPublicPage(link, 250_000);
    if (page.ok) pages.push(readSiteFacts(page.html, page.finalUrl));
  }

  const current = await loadBrain(organizationId);
  const fromFacts = profileFromFacts(pages, home.finalUrl);
  const sellsOnline = pages.some((p) => p.products.length > 0 || /add to (cart|bag)|checkout|shop now/i.test(p.text));
  const literal = literalConversionIssues(pages[0], sellsOnline);

  let found: Partial<BrainProfile> = fromFacts;
  let analysis: BrainAnalysis = {
    strongestOffer: null,
    conversionIssues: literal,
    strategy: null,
    pagesRead: pages.map((p) => p.url),
    aiUsed: false,
    note: null,
  };

  if (process.env.ANTHROPIC_API_KEY?.trim()) {
    try {
      const ai = onlyShownPrices(await analyzeWithAi(pages), pages);
      found = {
        ...fromFacts,
        businessName: ai.businessName || fromFacts.businessName,
        industry: ai.industry,
        overview: ai.overview || fromFacts.overview,
        products: ai.products.length ? ai.products.map((x) => newProduct(x)) : fromFacts.products,
        offers: ai.offers,
        discounts: ai.discounts,
        averageOrderValue: ai.averageOrderValue,
        targetCustomer: ai.targetCustomer,
        brandStyle: ai.brandStyle,
        brandVoice: ai.brandVoice,
        primaryCta: ai.primaryCta || fromFacts.primaryCta,
        categories: ai.categories,
        bestProducts: ai.bestProducts,
        painPoints: ai.painPoints,
        desires: ai.desires,
        usps: ai.usps,
        competitorCategory: ai.competitorCategory,
        opportunities: ai.opportunities,
      };
      const literalNames = new Set(literal.map((i) => i.issue.toLowerCase()));
      analysis = {
        ...analysis,
        aiUsed: true,
        strongestOffer: ai.strongestOffer,
        conversionIssues: [...literal, ...ai.conversionIssues.filter((i) => !literalNames.has(i.issue.toLowerCase()))].slice(0, 8),
        strategy: {
          primaryProduct: ai.strategy.primaryProduct,
          audience: ai.strategy.audience,
          angle: ai.strategy.angle,
          platform: "Meta — Facebook and Instagram",
          secondaryPlatform: ai.strategy.placement,
          budgetPerDayDollars: Math.round(ai.strategy.budgetPerDayDollars),
          budgetReason: ai.strategy.budgetReason,
          goal: ai.strategy.goal,
          campaignLabel: ai.strategy.campaignLabel,
          creative: ai.strategy.creative,
          promotes: ai.strategy.promotes,
        },
      };
    } catch (error) {
      console.error("Business analysis AI call failed:", error);
      analysis.note = "MAIRO read your site, but the AI part of the analysis didn't finish. What's below comes straight from the pages. Try again in a minute for the full analysis.";
    }
  } else {
    analysis.note = "The AI part of the analysis isn't switched on for this site, so what's below comes straight from your pages.";
  }

  const profile = mergeAnalysis(current.profile, sanitizeProfile(found), current.editedFields);
  // What the website showed is MAIRO's inference until the business confirms
  // it; facts the business confirmed were left alone by mergeAnalysis.
  const now = new Date();
  const read = (Object.keys(profile) as (keyof typeof profile)[]).filter((k) => JSON.stringify(profile[k]) !== JSON.stringify(current.profile[k]));
  await saveBrain(organizationId, {
    profile,
    analysis,
    analyzedUrl: home.finalUrl,
    analyzedAt: now,
    meta: { ...current.meta, ...Object.fromEntries(read.map((k) => [k, newMeta("website", now)])) },
  });
  await recordRun({
    organizationId,
    agent: "STRATEGIST",
    task: "read-website",
    status: "DONE",
    summary: `Read your website (${new URL(home.finalUrl).hostname}, ${pages.length} page${pages.length === 1 ? "" : "s"}) and updated what MAIRO knows about your business.`,
    href: "/dashboard/settings/business-brain",
  });
  return { ok: true, brain: await loadBrain(organizationId) };
}
