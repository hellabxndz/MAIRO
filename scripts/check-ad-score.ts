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
import { reviewFindings, reviewStatus } from "@/lib/campaigns/review-rules";
import { scoreCampaign, hookOf, scoreBand, scoreSummary, offerIdeas, PASSED_KEY_CHECKS, type AiCopyScores } from "@/lib/score/rules";
import { applyEdits } from "@/lib/score/edits";
import { areaDetail, compareScores, creativeAdvice, launchChecklist, reviewOverview } from "@/lib/score/review";
import { applyBusinessAnswer, businessAnswer, campaignAnswerEdit, questionsFor, type KnownBusiness } from "@/lib/score/questions";
import { EMPTY_CONTEXT } from "@/lib/campaigns/plan";

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
  ok("the summary agrees with the number", s.recommendations.length > 0 ? /MAIRO found/.test(s.summary) : s.summary === PASSED_KEY_CHECKS || s.overall === 100, s.summary);
  ok("never 'nothing to improve'", !/nothing to improve/i.test(s.summary));
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


const weakPlan = plan({
  copyOptions: [{ angle: "x", primaryText: "We are a family business that has been making shoes for years and we love what we do.", headline: "Stride", cta: "SHOP_NOW" }],
  audienceMode: "manual", geoKey: "1", geoLabel: "Austin", geoRadius: 5, ageMin: 25, ageMax: 34,
});

console.log("\n— the words agree with the number —");
{
  ok("77 with three suggestions", scoreSummary(77, 3, 0) === "Good campaign — but MAIRO found a few ways to make it stronger.", scoreSummary(77, 3, 0));
  ok("below 100 with nothing specific says it's uncertainty, not a problem", scoreSummary(88, 0, 0) === PASSED_KEY_CHECKS);
  ok("only 100 says everything passed", /passed every/.test(scoreSummary(100, 0, 0)));
  let never = true;
  for (let o = 0; o <= 100; o += 3) for (let r = 0; r < 6; r++) for (const b of [0, 1]) if (/nothing to improve/i.test(scoreSummary(o, r, b))) never = false;
  ok("'nothing to improve' is never said, at any score", never);
  // The page's "MAIRO recommends" list and the sentence under the score must agree.
  const plans = [plan(), weakPlan, plan({ dailyAmount: 8 }), plan({ adChoice: "FACEBOOK_POST", selectedPost: { id: "1_2", message: "New colours are in!", imageUrl: null, permalink: null, createdAt: null } })];
  ok("whenever the page lists improvements, the summary says so", plans.every((p) => {
    const sc = score(p);
    const listed = reviewOverview(sc, { hasOwnWords: p.adChoice === "images" }).priorities.length;
    return listed === 0 || /MAIRO found/.test(sc.summary);
  }));
  ok("bands", [95, 85, 75, 65, 50].map((x) => scoreBand(x).title).join("|") === "Excellent Preparation|Strong Preparation|Good Preparation|Needs Improvement|Major Improvements Recommended");
  ok("band edges", scoreBand(90).key === "excellent" && scoreBand(89).key === "strong" && scoreBand(70).key === "good" && scoreBand(69).key === "needs" && scoreBand(59).key === "major");
  const words = [95, 85, 75, 65, 50].map((x) => `${scoreBand(x).title} ${scoreBand(x).line}`).join(" ");
  ok("no band promises results", !/guarantee|will (sell|perform|get)|more sales/i.test(words));
}


console.log("\n— what to improve first —");
{
  const s = score(weakPlan);
  const o = reviewOverview(s, { hasOwnWords: true, category: "retail" });
  ok("at most three at a time", o.priorities.length <= 3 && o.priorities.length > 0, String(o.priorities.length));
  ok("lowest score first", o.priorities.every((p, i, a) => i === 0 || a[i - 1].score <= p.score), o.priorities.map((p) => `${p.key}:${p.score}`).join());
  ok("each priority can actually be improved", o.priorities.every((p) => p.actionable));
  ok("estimates are above the current score and never above 100", o.priorities.every((p) => p.estimate === null || (p.estimate > p.score && p.estimate <= 100)));
  ok("the overall estimate is labelled potential, not results — and never negative", o.potential >= 0 && o.estimatedOverall <= 100 && o.estimatedOverall >= s.overall);
  const kept = reviewOverview(s, { hasOwnWords: true, kept: [o.priorities[0].key] });
  ok("an area kept as it is drops out of the priorities", !kept.priorities.some((p) => p.key === o.priorities[0].key));
  const list = launchChecklist(s, { hasOwnWords: true, kept: [o.priorities[0].key], website: true });
  ok("…and the checklist says it was kept", list.items.some((i) => i.ok && /kept as it is/.test(i.text)));
  const full = launchChecklist(s, { hasOwnWords: true, website: true });
  ok("the checklist warns for every area the page says it can improve", full.items.filter((i) => !i.ok && !i.blocking && i.key !== "tracking").length === o.areasToImprove, `${full.remaining} vs ${o.areasToImprove}`);
  ok("an improvable area is never listed as strong", !o.strong.some((d) => [...o.priorities, ...o.more].includes(d)) && o.strong.every((d) => !d.actionable || d.kept || d.score >= 80));
  ok("remaining counts the area warnings, matching the page", list.remaining === list.items.filter((i) => !i.ok && !i.blocking && i.key !== "tracking").length && full.remaining === o.areasToImprove);
  ok("a hook area has why-lower, improve and a fix", (() => { const d = areaDetail(s, "hook", { hasOwnWords: true }); return Boolean(d.whyLower) && d.improve.length > 0 && d.fix === "hook"; })());
  const strong = score(plan());
  ok("a strong area says what's working", areaDetail(strong, "audience").working.length > 0);
}

console.log("\n— the score never blocks a launch —");
{
  const p = weakPlan;
  const s = score(p);
  const status = reviewStatus(reviewFindings(p, FACTS, NOW));
  ok("a low-scoring but valid campaign can launch", s.blocking === 0 && status !== "SETUP_REQUIRED", `${s.overall} ${status}`);
  const blocked = launchChecklist(score(plan(), { ...FACTS, metaConnected: false }));
  ok("only a real setup problem shows as blocking", blocked.items[0]?.blocking === true);
}

console.log("\n— detected vs suggested —");
{
  const page = (text?: string) => ({ ...FACTS, landing: { ok: true as const, status: 200, finalUrl: "https://stride.example/one", mobileReady: true, hasMetaPixel: true, title: "Stride", text } });
  const ad = plan({ copyOptions: [{ angle: "x", primaryText: "Run further without sore feet. 20% off this week.", headline: "Lighter every mile", cta: "SHOP_NOW" }] });
  const long = "Stride One running shoes. Light and comfortable. ".repeat(10);
  const mismatch = score(ad, page(long));
  ok("an offer missing from the page is a detected issue", mismatch.recommendations.some((r) => r.id === "landing-offer" && /20% off/.test(r.title)));
  const matched = score(ad, page(`${long} Now 20% off everything.`));
  ok("…but not when the page says it", !matched.recommendations.some((r) => r.id === "landing-offer"));
  const unread = score(ad, page(undefined));
  ok("a page MAIRO couldn't read is never claimed to mismatch", !unread.recommendations.some((r) => r.id === "landing-offer"));
  ok("…it becomes something to check instead", unread.checks.some((c) => /couldn't read/.test(c.text)));
  ok("suggestions never lower the score", unread.groups.find((g) => g.key === "landing")!.score === matched.groups.find((g) => g.key === "landing")!.score);
  const d = areaDetail(mismatch, "landing");
  ok("the landing panel keeps them apart", d.detected.length === 1 && d.toCheck.length > 0 && !d.toCheck.some((t) => d.detected.includes(t)));
}

console.log("\n— setup in plain words —");
{
  const s = score(plan(), { ...FACTS, metaPixelActive: false });
  const t = s.recommendations.find((r) => r.id === "tracking");
  ok("tracking is said simply", t?.title === "MAIRO may not be able to measure purchases correctly yet.");
  ok("no jargon in the Simple title", !/pixel|event|dataset|prioritiz/i.test(t?.title ?? "x"));
  ok("with a Fix Tracking button", t?.link?.href === "/dashboard/tracking" && t.link.label === "Fix Tracking");
  ok("and the technical reason for Advanced view", /Purchase/.test(t?.technical ?? ""));
  ok("not said twice as a retargeting note", !s.recommendations.some((r) => r.id === "retargeting"));
}

console.log("\n— offers don't have to be discounts —");
{
  ok("a contractor is offered a free estimate", offerIdeas("trades").some((x) => /free estimate/i.test(x)));
  ok("no discount ideas for a contractor or software", ![...offerIdeas("trades"), ...offerIdeas("software")].some((x) => /discount|% off/i.test(x)));
  const none = score(plan({ offering: "Running shoes", promotesDetail: "Stride One" }), FACTS, null, []);
  const r = none.recommendations.find((x) => x.id === "offer-none");
  ok("the no-offer recommendation says it needn't be a discount", /doesn't have to be a discount/.test(r?.why ?? ""));
  const promo = score(plan({ offering: "Running shoes", promotesDetail: "Stride One", copyOptions: [{ angle: "x", primaryText: "Run further without sore feet.", headline: "Lighter", cta: "SHOP_NOW" }], context: { ...EMPTY_CONTEXT, promotion: "Buy one, get one half price this weekend", answers: {}, kept: [] } }), FACTS, null, []);
  ok("a campaign promotion counts as a real offer", !promo.recommendations.some((x) => x.id === "offer-none") && promo.recommendations.some((x) => x.id === "offer-hidden"));
}

console.log("\n— answering never moves the score by itself —");
{
  const a = score(weakPlan);
  const b = score({ ...weakPlan, context: { ...EMPTY_CONTEXT, answers: { "land-action": "Buy the starter kit", "cre-dish": "x" }, kept: ["hook"] } });
  ok("campaign answers and kept areas leave the score alone", a.overall === b.overall && JSON.stringify(a.groups) === JSON.stringify(b.groups));
  const c = compareScores(a, a);
  ok("a recheck with no change says so", c.delta === 0 && c.improved.length === 0 && c.headline === "No change to the score");
  const better = score(plan());
  const cmp = compareScores(a, better);
  ok("a real improvement is named", cmp.delta > 0 && cmp.improved.includes("Stronger hook"), JSON.stringify(cmp));
}

console.log("\n— help MAIRO learn your business —");
{
  const known: KnownBusiness = { usps: [], painPoints: [], customerResults: [], objections: [], customerPraise: [], bestProducts: [], offers: [], creativeAssets: [], targetCustomer: "", serviceArea: "", customerAges: "", bestCustomers: "", excludedCustomers: "", mostProfitable: "", declinedQuestions: [] };
  const ctx = { ...EMPTY_CONTEXT, answers: {}, kept: [] };
  const all = (category: Parameters<typeof questionsFor>[0]["category"]) =>
    questionsFor({ areas: ["hook", "offer", "audience", "creative", "landing", "setup"], category, goal: "SALES", known, context: ctx, limit: 50 }).map((q) => q.text);
  const food = all("food"), software = all("software"), trades = all("trades");
  ok("a restaurant is asked about its menu", food.some((t) => /menu item/.test(t)) && food.some((t) => /slower days/.test(t)));
  ok("software is asked about the problem it solves and a trial", software.some((t) => /software solves/.test(t)) && software.some((t) => /trial/.test(t)));
  ok("a contractor is asked about free estimates", trades.includes("Do you offer free estimates?"));
  ok("never one questionnaire for everyone", food.join() !== software.join() && software.join() !== trades.join());
  const three = questionsFor({ areas: ["hook"], category: "auto", goal: "SALES", known, context: ctx });
  ok("a few at a time", three.length <= 3);
  ok("each question says why MAIRO is asking", three.every((q) => q.why.length > 15));
  const knows = questionsFor({ areas: ["hook"], category: "auto", goal: "SALES", known: { ...known, usps: ["24-hour turnaround"], painPoints: ["Swirl marks"], customerResults: ["A deep shine"], objections: ["Price"] }, context: ctx });
  ok("a known answer is confirmed, not asked again", knows.length === 1 && knows[0].mode === "confirm" && /24-hour turnaround/.test(knows[0].text) && /still correct/.test(knows[0].text));
  ok("…at most one confirmation at a time", knows.filter((q) => q.mode === "confirm").length <= 1);
  const promoQ = questionsFor({ areas: ["offer"], category: "retail", goal: "SALES", known, context: ctx }).find((q) => q.id === "offer-promo")!;
  ok("a promotion is a campaign question", promoQ.scope === "campaign");
  const edit = campaignAnswerEdit(promoQ, "20% off this weekend");
  ok("its answer edits this campaign only", edit.op === "context" && edit.patch.promotion === "20% off this weekend");
  ok("…and can't be saved to the business profile", businessAnswer("offer-promo", "20% off", "retail").kind === "invalid");
  const said_no = applyEdits(plan(), [campaignAnswerEdit(promoQ, "no")]);
  ok("'no' is remembered for this campaign", said_no.context.promotion === "" && !questionsFor({ areas: ["offer"], category: "retail", goal: "SALES", known, context: said_no.context }).some((q) => q.id === "offer-promo"));
  const yes = businessAnswer("offer-standing", "yes", "trades");
  ok("'yes' to free estimates saves a clear offer", yes.kind === "save" && yes.value === "Free estimates");
  const detail = businessAnswer("offer-standing", "Yes — free estimates within 24 hours", "trades");
  ok("…with the owner's detail when given", detail.kind === "save" && detail.value === "Free estimates within 24 hours");
  const no = applyBusinessAnswer(known, "offer-guarantee", businessAnswer("offer-guarantee", "No", "trades"));
  ok("a 'no' isn't asked again", !questionsFor({ areas: ["offer"], category: "trades", goal: "SALES", known: no, context: ctx }).some((q) => q.id === "offer-guarantee"));
  const updated = applyBusinessAnswer({ ...known, usps: ["Old point", "Second"] }, "hook-why-us", businessAnswer("hook-why-us", "24-hour turnaround", "auto", true));
  ok("an updated confirmation replaces what MAIRO had first", updated.usps[0] === "24-hour turnaround" && updated.usps[1] === "Second");
  const assets = businessAnswer("cre-assets", "Before/after photos; Testimonials; Made up", "beauty_fitness");
  ok("asset choices keep only real options", assets.kind === "save" && JSON.stringify(assets.value) === JSON.stringify(["Before/after photos", "Testimonials"]));
  ok("creative advice uses what they have", /before\/after/.test(creativeAdvice({ goal: "LEADS", category: "beauty_fitness", assets: ["Before/after photos"] })));
}

console.log(bad === 0 ? "\nAll checks passed.\n" : `\n${bad} FAILED\n`);
process.exit(bad === 0 ? 0 : 1);
