// Checks the MAIRO Business Brain's promises.
//
//   npm run check:brain
//
// The customer's word wins over inference; nothing is silently lost (removed
// facts become history); only marketing facts are kept; important facts are
// re-checked one at a time when stale or contradicted; understanding never
// demands 100%; lessons are worded as observations with honest confidence;
// promotions expire and are never permanent facts; the questions asked
// depend on the current goal; and the prompt every feature reads keeps
// current, temporary, historical and learned knowledge apart.

import assert from "node:assert/strict";
import { BRAIN_FIELDS, isMarketingField, type FactMeta } from "../src/lib/brain/catalog";
import { applyChange, confirmationQuestion, requiresConfirmation, type BrainState } from "../src/lib/brain/edit";
import {
  GOAL_PRIORITY,
  carefulWording,
  claimsCause,
  confidenceWords,
  factToVerify,
  insightMark,
  mayReplace,
  metaFor,
  newMeta,
  promoCode,
  promoState,
  understanding,
} from "../src/lib/brain/rules";
import { brainPrompt, type BrainState as FullState } from "../src/lib/brain/store";
import { EMPTY_PROFILE, brainBrief, newProduct, type BrainProfile } from "../src/lib/business/brain";
import { questionsFor, type KnownBusiness } from "../src/lib/score/questions";

let passed = 0;
async function check(name: string, fn: () => void | Promise<void>) {
  await fn();
  passed++;
  console.log(`  ok  ${name}`);
}

const NOW = new Date("2026-10-02T12:00:00Z");
const DAY = 86_400_000;
const ago = (d: number) => new Date(NOW.getTime() - d * DAY);

function state(p: Partial<BrainProfile> = {}, meta: Record<string, FactMeta> = {}): BrainState {
  return { profile: { ...EMPTY_PROFILE, ...p } as unknown as BrainState["profile"], meta, history: [] };
}

async function main() {
  console.log("\n— only what helps marketing —");
  await check("every stored fact says how it improves marketing", () => {
    for (const f of BRAIN_FIELDS) assert.ok(f.purpose.length > 15, f.key);
    assert.equal(new Set(BRAIN_FIELDS.map((f) => f.key)).size, BRAIN_FIELDS.length);
  });
  await check("anything else is refused", () => {
    assert.equal(isMarketingField("favouriteColourOfTheOwner"), false);
    const r = applyChange(state(), { op: "set", field: "ownerBirthday", value: "June" }, "assistant", NOW);
    assert.ok(r.refused && /improve your marketing/.test(r.refused));
  });

  console.log("\n— the customer's word wins —");
  await check("an inference never overwrites what the business said", () => {
    const s = state({ usps: ["24-hour turnaround"] }, { usps: newMeta("customer", ago(10)) });
    const r = applyChange(s, { op: "set", field: "usps", value: "Cheapest in town" }, "website", NOW);
    assert.ok(r.refused);
    assert.deepEqual(r.state.profile.usps, ["24-hour turnaround"]);
    assert.equal(mayReplace(newMeta("customer", NOW), "performance"), false);
  });
  await check("a correction replaces an inference, and is marked confirmed", () => {
    const s = state({ targetCustomer: "Everyone" }, { targetCustomer: newMeta("website", ago(30)) });
    const r = applyChange(s, { op: "set", field: "targetCustomer", value: "Car enthusiasts 20–45" }, "customer", NOW);
    assert.equal(r.state.profile.targetCustomer, "Car enthusiasts 20–45");
    assert.equal(r.state.meta.targetCustomer.status, "confirmed");
    assert.equal(r.state.history.length, 0, "a wrong guess isn't history");
  });
  await check("sources are kept: told vs inferred", () => {
    assert.equal(newMeta("customer", NOW).status, "confirmed");
    assert.equal(newMeta("assistant", NOW).status, "confirmed");
    assert.equal(newMeta("performance", NOW).status, "inferred");
    assert.equal(newMeta("website", NOW).status, "inferred");
    const legacy = { edited: ["usps"], analyzedAt: ago(5), updatedAt: ago(1) };
    assert.equal(metaFor("usps", {}, legacy).source, "customer");
    assert.equal(metaFor("overview", {}, legacy).source, "website");
  });

  console.log("\n— nothing silently lost —");
  await check("removing a fact moves it to history, not current", () => {
    const s = state({ products: [newProduct({ name: "Window tinting", kind: "service" })] });
    const r = applyChange(s, { op: "remove-product", name: "Window tinting" }, "customer", NOW);
    assert.equal(r.state.profile.products.length, 0);
    assert.match(r.state.history[0].text, /Previously offered Window tinting/);
  });
  await check("replacing a confirmed fact keeps the old one as history", () => {
    const s = state({ focusItem: "Residential roofing" }, { focusItem: newMeta("customer", ago(90)) });
    const r = applyChange(s, { op: "set", field: "focusItem", value: "Commercial roofing" }, "assistant", NOW);
    assert.equal(r.state.profile.focusItem, "Commercial roofing");
    assert.match(r.state.history[0].text, /Residential roofing/);
  });
  await check("removing one item from a list keeps the rest", () => {
    const s = state({ offers: ["Free estimates", "Financing available"] }, { offers: newMeta("customer", ago(3)) });
    const r = applyChange(s, { op: "remove", field: "offers", value: "Free estimates" }, "assistant", NOW);
    assert.deepEqual(r.state.profile.offers, ["Financing available"]);
    assert.match(r.state.history[0].text, /Free estimates \(no longer\)/);
  });
  await check("product records: priority, availability, and adding new ones", () => {
    let s = state({ products: [newProduct({ name: "Ceramic coating", price: "$1,200" })] });
    s = applyChange(s, { op: "product", name: "ceramic coating", patch: { priority: "high", profitability: "high", goal: "Increase bookings" } }, "customer", NOW).state;
    assert.deepEqual([s.profile.products[0].priority, s.profile.products[0].profitability, s.profile.products[0].goal], ["high", "high", "Increase bookings"]);
    const sold = applyChange(s, { op: "product", name: "Blue hoodie", patch: { status: "unavailable" } }, "customer", NOW);
    assert.equal(sold.state.profile.products[1].status, "unavailable");
    assert.match(sold.text, /won't promote it/);
  });
  await check("permanent changes from chat need a yes first; small ones don't", () => {
    assert.equal(requiresConfirmation({ op: "remove", field: "offers", value: "Free estimates" }), true);
    assert.equal(requiresConfirmation({ op: "set", field: "focusItem", value: "Commercial roofing" }), true);
    assert.equal(requiresConfirmation({ op: "add", field: "bestProducts", value: "Premium Detail" }), false);
    assert.equal(requiresConfirmation({ op: "product", name: "Blue hoodie", patch: { status: "unavailable" } }), false);
    assert.equal(confirmationQuestion({ op: "remove", field: "offers", value: "Free estimates" }), "Should MAIRO remove “Free estimates” from standing offers?");
  });

  console.log("\n— checking what may have changed —");
  await check("a long-unconfirmed important fact is checked, one at a time", () => {
    const p = { ...EMPTY_PROFILE, focusItem: "Ceramic coating", usps: ["24-hour turnaround"] } as unknown as Record<string, unknown>;
    const v = factToVerify(p, (k) => newMeta("customer", k === "usps" ? ago(400) : ago(200)), NOW);
    assert.equal(v?.key, "usps", "the oldest first");
    assert.match(v!.question, /still right/);
    assert.equal(factToVerify(p, () => newMeta("customer", ago(10)), NOW), null, "recent facts aren't asked about");
  });
  await check("a contradiction is checked straight away", () => {
    const p = { ...EMPTY_PROFILE, focusItem: "Blue hoodie", products: [newProduct({ name: "Blue hoodie", status: "unavailable" })] } as unknown as Record<string, unknown>;
    const v = factToVerify(p, () => newMeta("customer", ago(1)), NOW);
    assert.equal(v?.reason, "conflict");
  });

  console.log("\n— understanding, not a game —");
  await check("percent by area, never required to be 100", () => {
    const u = understanding({ ...EMPTY_PROFILE, industry: "Auto detailing", overview: "Detailing and ceramic coating", usps: ["24-hour turnaround"] } as unknown as Record<string, unknown>, [], 3);
    assert.ok(u.percent > 0 && u.percent < 100);
    assert.equal(u.areas.length, 6);
    assert.ok(u.enoughToRun);
    assert.equal(u.message, "MAIRO has enough information to run your campaigns, but answering 3 more questions may improve its recommendations.");
    assert.doesNotMatch(u.message, /100|required|must/i);
  });
  await check("performance data counts only what results have shown", () => {
    const none = understanding(EMPTY_PROFILE as unknown as Record<string, unknown>, [], 0).areas.find((a) => a.key === "performance")!;
    const some = understanding(EMPTY_PROFILE as unknown as Record<string, unknown>, [{ confidence: "MEDIUM" }], 0).areas.find((a) => a.key === "performance")!;
    assert.equal(none.percent, 0);
    assert.ok(some.percent > 0 && some.percent < 100);
  });

  console.log("\n— honest lessons —");
  await check("confidence in plain words", () => {
    assert.equal(confidenceWords("EARLY"), "MAIRO is starting to notice");
    assert.equal(confidenceWords("MEDIUM"), "MAIRO has noticed");
    assert.equal(confidenceWords("HIGH"), "MAIRO has consistently found");
    assert.equal(insightMark("HIGH"), "🔥");
    assert.equal(insightMark("EARLY"), "💡");
  });
  await check("correlation is never stated as cause", () => {
    assert.ok(claimsCause("Video caused more sales"));
    const said = carefulWording("Video caused more sales and testimonials drove leads.");
    assert.ok(!claimsCause(said), said);
    assert.equal(carefulWording("Before-and-after videos produced more leads than static graphics."), "Before-and-after videos produced more leads than static graphics.");
  });

  console.log("\n— temporary stays temporary —");
  await check("promotions are scheduled, active, then over on their own", () => {
    assert.equal(promoState(ago(-2), ago(-5), NOW), "scheduled");
    assert.equal(promoState(ago(1), ago(-2), NOW), "active");
    assert.equal(promoState(ago(10), ago(3), NOW), "ended");
    assert.equal(promoCode("20% off all products, code FALL20 until Friday"), "FALL20");
    assert.equal(promoCode("20% off this weekend"), null);
  });

  console.log("\n— the right question for the goal —");
  await check("a leads goal asks about the offer, the problem and objections first", () => {
    const known = { ...EMPTY_PROFILE } as unknown as KnownBusiness;
    const ctx = { promotion: "", promotionEnds: "", urgency: "", answers: {}, kept: [] };
    const qs = questionsFor({ areas: ["setup", "offer", "hook", "audience", "creative", "landing"], category: "trades", goal: null, known, context: ctx, limit: 3, prefer: GOAL_PRIORITY.leads }).filter((q) => q.scope === "business");
    assert.deepEqual(qs.map((q) => q.id), ["offer-standing", "hook-problem", "land-objection"]);
    const brand = questionsFor({ areas: ["setup", "offer", "hook", "audience", "creative", "landing"], category: "trades", goal: null, known, context: ctx, limit: 3, prefer: GOAL_PRIORITY.social });
    assert.notDeepEqual(brand.map((q) => q.id), qs.map((q) => q.id), "a different goal, different questions");
  });
  await check("known facts aren't asked again", () => {
    const known = { ...EMPTY_PROFILE, offers: ["Free estimates"], painPoints: ["Leaks after storms"], objections: ["Price"] } as unknown as KnownBusiness;
    const ctx = { promotion: "", promotionEnds: "", urgency: "", answers: {}, kept: [] };
    const qs = questionsFor({ areas: ["offer", "hook", "landing"], category: "trades", goal: null, known, context: ctx, limit: 3, prefer: GOAL_PRIORITY.leads });
    assert.ok(!qs.some((q) => q.mode === "ask" && ["offer-standing", "hook-problem", "land-objection"].includes(q.id)));
  });

  console.log("\n— one prompt, four kinds of knowledge —");
  await check("current, temporary, unavailable, history and learned are kept apart", () => {
    const profile = { ...EMPTY_PROFILE, businessName: "Elite Auto Spa", industry: "Auto detailing", focusItem: "Ceramic coating", usps: ["24-hour turnaround"], objections: ["Price"], avoidClaims: ["Cheap-looking discount graphics"], products: [newProduct({ name: "Ceramic coating", price: "$1,200", priority: "high" }), newProduct({ name: "Window tint", status: "unavailable" })] };
    const s = {
      profile,
      meta: (k: string) => (k === "industry" ? newMeta("website", ago(5)) : newMeta("customer", ago(5))),
      history: [{ field: "products", text: "Previously offered paint correction", until: ago(40).toISOString(), source: "customer" }],
      goals: { current: { goal: "GET_BOOKINGS", label: "Get more appointments", secondary: null, from: ago(20), to: null }, history: [] },
      temporary: [{ id: "1", kind: "promotion", text: "20% off this weekend", code: null, state: "active", startsAt: ago(1), endsAt: ago(-2) }],
      learned: [
        { id: "a", statement: "Before/after videos caused more bookings", said: `${confidenceWords("HIGH")}: ${carefulWording("before/after videos caused more bookings")}`, mark: "🔥", confidence: "HIGH", detail: "", evidence: [], goal: "GET_BOOKINGS", sampleSize: 6, discoveredAt: ago(30), validatedAt: ago(2), active: true },
        { id: "b", statement: "Evenings might be better", said: "MAIRO is starting to notice: evenings might be better", mark: "💡", confidence: "EARLY", detail: "", evidence: [], goal: null, sampleSize: 1, discoveredAt: ago(3), validatedAt: ago(3), active: true },
      ],
    } as unknown as FullState;
    const text = brainPrompt(s);
    assert.match(text, /Ceramic coating · \$1,200 · priority/);
    assert.match(text, /NEVER say or show: Cheap-looking discount graphics/);
    assert.match(text, /Inferred .*Industry/);
    assert.match(text, /Current goal: Get more appointments/);
    assert.match(text, /Temporary — true only until it ends[\s\S]*20% off this weekend, ends/);
    assert.match(text, /Unavailable right now — never promote: Window tint/);
    assert.match(text, /Used to be true \(history — not current\)[\s\S]*paint correction/);
    assert.match(text, /MAIRO has consistently found: before\/after videos went with more bookings \(based on 6 compared\)/);
    assert.doesNotMatch(text, /videos caused/, "the lesson is worded as an observation");
    assert.doesNotMatch(text, /evenings might be better/i, "early hunches aren't presented as patterns");
    assert.match(text, /still learning 1 other pattern/);
  });
  await check("the profile summary carries product status and brand rules", () => {
    const b = brainBrief({ ...EMPTY_PROFILE, products: [newProduct({ name: "Blue hoodie", status: "unavailable" })], avoidClaims: ["Guaranteed results"] });
    assert.match(b, /Blue hoodie · UNAVAILABLE/);
    assert.match(b, /NEVER say or show: Guaranteed results/);
  });

  console.log(`\n${passed} checks passed.\n`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
