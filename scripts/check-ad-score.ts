// Checks the Pre-Launch Ad Score.
//
//   npm run check:ad-score
//
// The promises: a campaign that can't launch never scores as strong, every
// weakness it names comes with a way to fix it or a reason there isn't one,
// the score doesn't pretend the AI read the words when it didn't, and an
// approved fix changes exactly what it says.

import { newPlan, type CampaignPlan } from "@/lib/campaigns/plan";
import type { ReviewFacts } from "@/lib/campaigns/review-rules";
import { reviewFindings } from "@/lib/campaigns/review-rules";
import { scoreCampaign, hookOf, type AiCopyScores } from "@/lib/score/rules";
import { applyEdits } from "@/lib/score/edits";

let bad = 0;
const ok = (n: string, c: boolean, x = "") => {
  if (!c) {
    bad++;
    console.log(`  FAIL ${n} ${x}`);
  } else console.log(`  ok   ${n}`);
};

const NOW = new Date("2026-09-29T12:00:00Z");

function plan(p: Partial<CampaignPlan> = {}): CampaignPlan {
  return {
    ...newPlan({ service: "meta", businessName: "Stride", website: "https://stride.example", offering: "Running shoes", targetAudience: "Runners", differentiator: "Light", messageChannel: "MESSENGER", timeZone: "UTC", metaPercent: 100 }),
    goal: "SALES",
    promotes: "PRODUCT",
    promotesDetail: "Stride One",
    destinationType: "WEBSITE",
    destinationValue: "https://stride.example/one",
    dailyAmount: 30,
    adChoice: "images",
    images: [{ url: "https://x.public.blob.vercel-storage.com/ad-media/o1/a.jpg", name: "a", width: 1080, height: 1080 }],
    copyOptions: [{ angle: "Benefit", primaryText: "Run further without sore feet. Stride One weighs 180g and ships free over $100.", headline: "Lighter every mile", cta: "SHOP_NOW" }],
    chosenCopy: 0,
    ...p,
  };
}

const FACTS: ReviewFacts = {
  metaConnected: true,
  pageChosen: true,
  funding: "funded",
  currency: "USD",
  metaPixelActive: true,
  hasApprovedCreative: true,
  landing: { ok: true, status: 200, finalUrl: "https://stride.example/one", mobileReady: true, hasMetaPixel: true, title: "Stride" },
};

function score(p: CampaignPlan, facts: ReviewFacts = FACTS, ai: AiCopyScores | null = null, offers: string[] = ["Free shipping over $100"]) {
  return scoreCampaign({ plan: p, facts, findings: reviewFindings(p, facts, NOW), ai, brain: { brandVoice: "Friendly", offers }, now: NOW });
}

console.log("\n— the shape —");
{
  const s = score(plan());
  ok("0–100", s.overall >= 0 && s.overall <= 100, String(s.overall));
  ok("six headline groups", s.groups.map((g) => g.label).join() === "Creative,Hook,Offer,Audience,Landing Page,Campaign Setup");
  ok("fifteen checks underneath", s.factors.length === 15);
  ok("a summary that names the count", /Mairo found/.test(s.summary), s.summary);
  ok("a well-built campaign scores 70+", s.overall >= 70, String(s.overall));
  ok("says the AI didn't read it when it didn't", s.aiUsed === false);
}

console.log("\n— what can't launch never scores well —");
{
  const noAccount = score(plan(), { ...FACTS, metaConnected: false });
  ok("a blocking problem caps the score at 45", noAccount.overall <= 45, String(noAccount.overall));
  ok("and the verdict says setup is required", noAccount.verdict === "Setup required");
  const broken = score(plan(), { ...FACTS, landing: { ok: false, reason: "error_status", status: 404, message: "The page answered with an error (404)." } });
  ok("a broken page is a high-severity recommendation", broken.recommendations[0]?.id === "landing-broken");
  ok("which points to the website check, not an AI fix", broken.recommendations[0]?.fix === "landing");
}

console.log("\n— the recommendations —");
{
  const weak = score(plan({ copyOptions: [{ angle: "x", primaryText: "We are a family business that has been making shoes for years and we love what we do.", headline: "Stride", cta: "SHOP_NOW" }] }));
  ok("a business-first opening line is flagged", weak.recommendations.some((r) => r.id === "hook" && r.fix === "hook"));
  ok("an offer that isn't in the words is flagged", weak.recommendations.some((r) => r.id === "offer-hidden"));
  const noOffer = score(plan({ offering: "Running shoes", promotesDetail: "Stride One" }), FACTS, null, []);
  ok("no offer at all suggests one — but never writes one in", noOffer.recommendations.some((r) => r.id === "offer-none"));
  const phone = score(plan(), { ...FACTS, landing: { ...FACTS.landing!, ok: true, mobileReady: false } as ReviewFacts["landing"] });
  ok("a page not built for phones is flagged high", phone.recommendations.some((r) => r.id === "landing-mobile" && r.severity === "high"));
  const narrow = score(plan({ audienceMode: "manual", geoKey: "1", geoLabel: "Austin", geoRadius: 5, ageMin: 25, ageMax: 34 }));
  ok("a tiny audience is flagged with a fix", narrow.recommendations.some((r) => r.id === "audience-narrow" && r.fix === "audience"));
  const placed = score(plan({ choosingPlacements: true, placements: ["FACEBOOK_FEED"] }));
  ok("hand-picked placements suggest letting Meta choose", placed.recommendations.some((r) => r.fix === "placements"));
  const lowBudget = score(plan({ dailyAmount: 8 }));
  ok("a low sales budget gets a budget recommendation", lowBudget.recommendations.some((r) => r.fix === "budget"));
  ok("high-severity first", weak.recommendations.every((r, i, a) => i === 0 || ["high", "medium", "low"].indexOf(a[i - 1].severity) <= ["high", "medium", "low"].indexOf(r.severity)));
  ok("every recommendation says why", [...weak.recommendations, ...narrow.recommendations].every((r) => r.why.length > 10));
}

console.log("\n— the AI read, when there is one —");
{
  const ai: AiCopyScores = {
    creative: { score: 91, reason: "Clear product shot." },
    hook: { score: 74, reason: "Good, but generic." },
    headline: { score: 80, reason: "Specific." },
    primaryText: { score: 82, reason: "Point first." },
    offer: { score: 68, reason: "Offer is late." },
    brand: { score: 85, reason: "Sounds friendly." },
    offerVisible: true,
  };
  const s = score(plan(), FACTS, ai);
  ok("uses the AI's scores", s.factors.find((f) => f.key === "creative")?.score === 91 && s.groups.find((g) => g.key === "hook")?.score === 74);
  ok("and says it did", s.aiUsed);
}

console.log("\n— existing posts —");
{
  const post = score(plan({ adChoice: "FACEBOOK_POST", selectedPost: { id: "1_2", message: "New colours are in!", imageUrl: null, permalink: null, createdAt: null } }));
  ok("the words of an existing post aren't offered for rewriting", !post.recommendations.some((r) => r.fix === "headline" || r.fix === "hook"));
  ok("headline and button aren't judged for a post", post.factors.find((f) => f.key === "headline")?.score === null);
}

console.log("\n— applying an approved fix —");
{
  const p = plan();
  const next = applyEdits(p, [
    { op: "copy-field", index: 0, field: "headline", value: "New headline" },
    { op: "set", patch: { choosingPlacements: false, placements: [] } },
  ]);
  ok("changes exactly the field it names", next.copyOptions[0].headline === "New headline" && next.copyOptions[0].primaryText === p.copyOptions[0].primaryText);
  ok("doesn't touch the original", p.copyOptions[0].headline === "Lighter every mile");
  ok("adds a version", applyEdits(p, [{ op: "add-copy", option: { angle: "a", primaryText: "b", headline: "c", cta: "SHOP_NOW" } }]).copyOptions.length === 2);
  ok("hook is the first sentence", hookOf("Run further. Then rest.") === "Run further.");
}

console.log(bad === 0 ? "\nAll checks passed.\n" : `\n${bad} FAILED\n`);
process.exit(bad === 0 ? 0 : 1);
