import { FACT_LABEL, previewKind, type FactKey, type FactSource, type Preview, type PreviewFacts } from "@/lib/preview/build";
import { businessTypeFrom } from "@/lib/onboarding/business-types";
import type { Finding } from "@/lib/website/audit";

// The free plan as a consultation: what MAIRO understood about the business,
// where the advertising opportunities are, and the three to five things worth
// doing first — each built from facts the visitor confirmed, the website or
// Instagram reading when there was one, and the plan itself. Pure and
// deterministic, pinned by scripts/check-preview.ts.
//
// What it never does: forecast sales, leads or returns; invent a metric the
// business hasn't connected; recommend a network MAIRO doesn't run (Facebook
// and Instagram, through Meta, only); or present a recommendation as done.

export type SourceWord = "From your website" | "From your Instagram" | "You told MAIRO" | "Example" | "MAIRO's suggestion";

export function sourceWord(s: FactSource | undefined): SourceWord {
  if (!s) return "MAIRO's suggestion";
  return s.from === "website" ? "From your website" : s.from === "instagram" ? "From your Instagram" : s.from === "example" ? "Example" : "You told MAIRO";
}

export type OverviewItem = { label: string; value: string; source: SourceWord };

const GOAL_WORDS = { sales: "More online sales", leads: "More enquiries and leads", bookings: "More bookings" } as const;

/** What MAIRO understands about the business — only what it was told or read. */
export function businessOverview(f: PreviewFacts, p: Preview): OverviewItem[] {
  const out: OverviewItem[] = [];
  const add = (k: FactKey) => {
    if (f[k].trim()) out.push({ label: FACT_LABEL[k], value: f[k].trim(), source: sourceWord(f.sources[k]) });
  };
  add("name");
  add("offering");
  const type = businessTypeFrom(f.businessType);
  if (type) out.push({ label: "Kind of business", value: type.label, source: f.typeFrom === "website" ? "From your website" : f.typeFrom === "example" ? "Example" : "You told MAIRO" });
  add("customer");
  add("location");
  if (f.goal) out.push({ label: "Main advertising objective", value: GOAL_WORDS[f.goal], source: "You told MAIRO" });
  add("offer");
  add("proof");
  if (!f.customer.trim()) out.push({ label: "Who it's for", value: `${p.plan.audience.split(",")[0]} — MAIRO's starting point until you say more`, source: "MAIRO's suggestion" });
  return out;
}

export type Opportunity = { area: "Audience" | "Offer" | "Trust" | "Website" | "Tracking" | "Social" | "Creative"; title: string; detail: string };

/**
 * Where the advertising can improve, from what's known — never a promise of
 * what it will bring. A website finding is the site's own reading; the rest
 * follow from the facts given (or not given).
 */
export function opportunities(f: PreviewFacts, p: Preview, findings: Finding[], instagram: string | null = null): Opportunity[] {
  const kind = previewKind(f.businessType, Boolean(f.destinations?.booking));
  const out: Opportunity[] = [];
  out.push(
    f.customer.trim()
      ? { area: "Audience", title: `Speak to ${f.customer.trim().toLowerCase()}`, detail: `${p.plan.audience}. One clear audience lets Meta find the people most like them, and lets one ad speak to them directly.` }
      : { area: "Audience", title: "Say who your best customers are", detail: `The plan starts with ${p.plan.audience.charAt(0).toLowerCase()}${p.plan.audience.slice(1)}. Naming your best customers gives MAIRO an ad written for them.` },
  );
  out.push(
    f.offer.trim()
      ? { area: "Offer", title: "Lead with your offer", detail: `"${f.offer.trim()}" gives people a reason to act now — one of the three concepts opens with it.` }
      : { area: "Offer", title: "Add an offer you really run", detail: "An offer is often the clearest reason to act now. MAIRO never invents a discount — add one you run and it writes an ad around it." },
  );
  if (!f.proof.trim()) out.push({ area: "Trust", title: "Add something true that builds trust", detail: "Years in business, a licence, reviews you can show — proof makes a stranger more comfortable. MAIRO uses only what you confirm." });
  for (const x of findings.slice(0, 2)) out.push({ area: "Website", title: x.title, detail: x.why || x.change || "Found on the pages MAIRO read." });
  if (!f.website) out.push({ area: "Website", title: kind === "shop" ? "Check your shop before you spend" : "Check where your ads send people", detail: "MAIRO didn't read a website for this plan. Add one and it checks what an ad visitor sees — speed, the button, tracking — before you spend." });
  if (f.pixelSeen === false) out.push({ area: "Tracking", title: "Add the Meta pixel", detail: `No Meta pixel was found on the pages read. Without it, Meta can't see which ads lead to ${p.plan.optimiseFor.toLowerCase()} on your site.` });
  if (instagram) out.push({ area: "Social", title: "Use what already works on your Instagram", detail: `Your own photos and videos from @${instagram} can become your ads — after you sign up, use them as they are, no AI credits needed.` });
  return out.slice(0, 6);
}

export type GrowthAction = { title: string; priority: "High" | "Medium" | "Low"; why: string; mairo: string };

/** Three to five things worth doing first, most important first — each with what MAIRO does about it. */
export function growthActions(f: PreviewFacts, p: Preview, findings: Finding[]): GrowthAction[] {
  const kind = previewKind(f.businessType, Boolean(f.destinations?.booking));
  const needed = p.tracking.events.find((e) => e.required)?.name ?? null;
  const leadForm = /lead form/i.test(p.plan.destination);
  const out: GrowthAction[] = [
    {
      title: `Run one test campaign: ${p.firstCampaign.name.split(" — ")[1] ?? "first test"}`,
      priority: "High",
      why: `${p.firstCampaign.objective}, judged on ${p.firstCampaign.judgedOn.toLowerCase()}. ${p.firstCampaign.length}.`,
      mairo: "Builds it in your own Meta ad account, switched off, and launches only when you approve the budget, audience and ads.",
    },
  ];
  if (needed && !leadForm) {
    out.push({
      title: `Make sure Meta sees each ${needed === "Purchase" ? "purchase" : needed === "Schedule" ? "booking" : "enquiry"}`,
      priority: f.pixelSeen ? "Medium" : "High",
      why: f.pixelSeen ? `A pixel is on your site; it has to report the ${needed} event for the campaign to learn.` : `Without the pixel's ${needed} event, Meta can't tell which ads worked.`,
      mairo: "Finds the pixel you have or creates one in your account, shows the steps for your website's platform, and checks that Meta receives the event.",
    });
  }
  const worst = findings[0];
  if (worst) out.push({ title: `Fix: ${worst.title}`, priority: findings.length > 1 ? "High" : "Medium", why: worst.why || "Found on the pages MAIRO read.", mairo: "Shows the evidence and the fix in your website check, and re-checks the page when you've changed it." });
  if (!f.offer.trim() || !f.proof.trim()) out.push({ title: !f.offer.trim() ? "Give the ads a reason to act now" : "Show proof in the ads", priority: "Medium", why: !f.offer.trim() ? "None of the concepts can lead with an offer yet." : "None of the concepts can open with proof yet.", mairo: "Writes new versions of the ads around what you add — you choose which to keep." });
  out.push({ title: "Set your spending limits before launch", priority: "Medium", why: "A monthly limit you choose keeps spending to what you planned.", mairo: "Spend Protection warns you, or pauses a campaign if you choose — it never raises a budget." });
  out.push(
    kind === "shop"
      ? { title: "Count real orders, not just Meta's", priority: "Low", why: "Meta reports purchases it attributes to ads; your store knows the orders that happened.", mairo: "If your store runs on Shopify, counts its orders (through a webhook you add) and keeps them apart from Meta's figure." }
      : { title: "Follow every enquiry to a job", priority: "Medium", why: "A lead is only worth what it becomes — a booking, a customer.", mairo: "Lists each enquiry on the Leads page for you to mark good, booked or customer, and shows where people drop out." },
  );
  out.push({ title: "Refresh ads before they wear out", priority: "Low", why: "People stop noticing an ad they've seen many times.", mairo: "Your AI team reads your results every day and proposes a fresh version when an ad stops working — you approve it." });
  return out.slice(0, 5);
}

export type AnalysisStep = { label: string; result: string };

/**
 * The five steps the visitor watches after pressing Build My Free Ad Plan.
 * Each one's result is what that step actually produced from their facts —
 * shown as it's revealed, never a stand-in for work that didn't happen.
 */
export function analysisSteps(f: PreviewFacts, p: Preview, opps: Opportunity[], actions: GrowthAction[]): AnalysisStep[] {
  const from = Object.values(f.sources).map((s) => s?.from);
  const read = from.includes("example") ? "the example business" : f.website ? "your website" : from.includes("instagram") ? "your Instagram profile" : "what you told MAIRO";
  return [
    { label: "Understanding your business", result: `${f.name} — ${f.offering}. From ${read}.` },
    { label: "Identifying your ideal customers", result: p.plan.audience },
    { label: "Exploring advertising opportunities", result: `${opps.length} found: ${opps.slice(0, 3).map((o) => o.area.toLowerCase()).filter((a, i, all) => all.indexOf(a) === i).join(", ")}` },
    { label: "Developing creative recommendations", result: `${p.directions.length} ad concept${p.directions.length === 1 ? "" : "s"} — ${p.directions.map((d) => d.label.toLowerCase()).join(", ")}` },
    { label: "Building your personalized MAIRO growth plan", result: `${actions.length} recommended action${actions.length === 1 ? "" : "s"}, starting with: ${actions[0].title.charAt(0).toLowerCase()}${actions[0].title.slice(1)}` },
  ];
}
