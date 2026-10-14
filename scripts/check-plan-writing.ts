// Checks the free AI ad plan's writing (src/lib/preview/plan-writing.ts and
// /api/tools/ad-plan):
//
//   - what the model writes is kept only when the facts support it: a number
//     that isn't in the facts, a guarantee, a rating, a "best", made-up
//     urgency or copy Meta would reject is dropped, and the plan says so;
//   - a concept that can't be kept is replaced from MAIRO's templates, and
//     the count is reported;
//   - the route validates its input, falls back to templates — labelled —
//     when the AI is off, and limits AI plans per visitor;
//   - the local test fixture is labelled as one and never runs in production.
//
//   npm run check:plan-writing   (uses the database for the visitor limit)

import assert from "node:assert/strict";
import { settlePlan, conceptFromDirection, type PlanConcept } from "../src/lib/preview/plan-writing";
import { buildPreview, emptyFacts, type PreviewFacts } from "../src/lib/preview/build";
import { db } from "../src/lib/db";

let passed = 0;
async function check(name: string, fn: () => void | Promise<void>) {
  await fn();
  passed++;
  console.log(`  ok  ${name}`);
}

const facts: PreviewFacts = { ...emptyFacts("https://shop.example"), name: "Nova Clothing", offering: "Premium streetwear clothing for young adults", customer: "Young adults", location: "Ships across the US", offer: "Free shipping on orders over $80", proof: "Designed in Austin", businessType: "ecommerce", typeFrom: "you", goal: "sales", sources: { name: { from: "you" }, offering: { from: "you" } } };
const preview = buildPreview(facts, { quick: true })!;
const fallback: PlanConcept[] = preview.directions.map((d) => conceptFromDirection(d, "sales", "Young adults"));
const good = (over: Partial<PlanConcept> = {}) => ({ label: "The offer", headline: "Free shipping over $80", primaryText: "Premium streetwear for young adults. Free shipping on orders over $80.", format: "Single image", visual: "Your newest piece, worn outside, natural light.", cta: "Shop now", targetCustomer: "Young adults", why: "Leads with a real offer.", ...over });

async function main() {
  console.log("— keeping only what the facts support —");
  await check("a clean plan is kept as written", () => {
    const r = settlePlan({ appeal: ["Designed in Austin."], customers: "Young adults who care about fit", messaging: ["Lead with free shipping."], concepts: [good(), good({ label: "Proof", headline: "Designed in Austin", primaryText: "Designed in Austin. Premium streetwear for young adults." }), good({ label: "Who it's for", headline: "Made for young adults", primaryText: "Streetwear made for young adults." })], firstIndex: 1, firstWhy: "Proof first." }, facts, fallback);
    assert.equal(r.filled, 0);
    assert.equal(r.plan.concepts.length, 3);
    assert.equal(r.plan.first, 1);
    assert.deepEqual(r.dropped, []);
  });
  await check("invented numbers, guarantees, ratings, superlatives and urgency are dropped — and reported", () => {
    const r = settlePlan(
      {
        appeal: ["Rated 4.9 by 2,000 customers.", "Designed in Austin."],
        customers: "Young adults",
        messaging: ["Guaranteed results.", "Lead with free shipping."],
        concepts: [
          good({ headline: "30% off this week" }),
          good({ label: "Best", headline: "The best streetwear in America" }),
          good({ label: "Hurry", primaryText: "Last chance — ends tonight! Premium streetwear." }),
        ],
        firstIndex: 2,
        firstWhy: "x",
      },
      facts,
      fallback,
    );
    assert.deepEqual(r.plan.appeal, ["Designed in Austin."]);
    assert.deepEqual(r.plan.messaging, ["Lead with free shipping."]);
    assert.ok(!r.plan.concepts.some((c) => /30%|best|ends tonight/i.test(c.headline + c.primaryText)));
    assert.ok(r.dropped.some((d) => /number not in your facts \(30%\)/.test(d)));
    assert.ok(r.dropped.some((d) => /superlative/.test(d)));
    assert.ok(r.dropped.some((d) => /a guarantee/.test(d)));
    assert.equal(r.plan.concepts.length, 3, "made up to three from the templates");
    assert.ok(r.filled >= 2);
    assert.equal(r.plan.first, 0, "a dropped concept can't be the one to test first");
  });
  await check("a sentence with an invented number is cut from the ad text; the rest stays", () => {
    const r = settlePlan({ concepts: [good({ primaryText: "Premium streetwear for young adults. Join 10,000 fans." })] }, facts, fallback);
    assert.equal(r.plan.concepts[0].primaryText, "Premium streetwear for young adults.");
  });
  await check("copy Meta would reject is dropped; buttons and formats are kept to the real lists", () => {
    const r = settlePlan({ concepts: [good({ primaryText: "Are you in debt? Premium streetwear for young adults." }), good({ cta: "Buy it now!!!", format: "Hologram" as never })] }, facts, fallback);
    assert.ok(r.dropped.some((d) => /personal about the reader/.test(d)));
    const kept = r.plan.concepts[0];
    assert.equal(kept.cta, "Shop now");
    assert.equal(kept.format, "Single image");
  });
  await check("nothing usable from the model: all three from the templates", () => {
    const r = settlePlan({}, facts, fallback);
    assert.equal(r.filled, 3);
    assert.deepEqual(r.plan.concepts.map((c) => c.headline), fallback.map((c) => c.headline));
    assert.equal(r.plan.customers, null);
  });

  console.log("\n— the route —");
  const { POST } = await import("../src/app/api/tools/ad-plan/route");
  const call = (body: unknown, ua = "check-plan-writing") => POST(new Request("http://x/api/tools/ad-plan", { method: "POST", headers: { "content-type": "application/json", "user-agent": ua }, body: JSON.stringify(body) }));
  const body = { facts: { name: "Nova Clothing", offering: "Premium streetwear clothing for young adults", website: null }, goal: "sales", monthly: 1000 };
  await check("bad input is refused with a plain message", async () => {
    const r = await call({ facts: { offering: "" }, goal: "sales", monthly: 1000 });
    assert.equal(r.status, 400);
    assert.equal((await call({ ...body, goal: "fame" })).status, 400);
    assert.equal((await call({ ...body, monthly: 5 })).status, 400);
  });
  const savedKey = process.env.ANTHROPIC_API_KEY;
  const savedFixture = process.env.MAIRO_PLAN_FIXTURE;
  delete process.env.ANTHROPIC_API_KEY;
  delete process.env.MAIRO_PLAN_FIXTURE;
  await check("with the AI off, the route says templates — it never pretends", async () => {
    const r = await (await call(body)).json();
    assert.deepEqual(r.source, { by: "templates", why: "off" });
    assert.equal(r.plan, null);
  });
  process.env.MAIRO_PLAN_FIXTURE = "1";
  const ua = `check-plan-writing-${Date.now()}`;
  await check("the local fixture is labelled as one and passes the same checks", async () => {
    const r = await (await call(body, ua)).json();
    assert.equal(r.source.by, "fixture");
    assert.match(r.source.note, /not MAIRO's AI/);
    assert.equal(r.plan.concepts.length, 3);
  });
  await check("AI plans are limited per visitor: over the limit, templates — with the reason", async () => {
    for (let i = 0; i < 5; i++) await call(body, ua);
    const r = await (await call(body, ua)).json();
    assert.deepEqual(r.source, { by: "templates", why: "limit" });
    assert.match(r.message, /6 AI-written plans this hour/);
  });
  const env = process.env as Record<string, string | undefined>;
  const savedNode = env.NODE_ENV;
  env.NODE_ENV = "production";
  await check("the fixture never runs in production", async () => {
    const r = await (await call(body, `${ua}-prod`)).json();
    assert.notEqual(r.source.by, "fixture");
  });
  env.NODE_ENV = savedNode;
  if (savedKey) process.env.ANTHROPIC_API_KEY = savedKey;
  if (savedFixture) process.env.MAIRO_PLAN_FIXTURE = savedFixture;
  else delete process.env.MAIRO_PLAN_FIXTURE;
  await db.toolUsage.deleteMany({ where: { bucket: { contains: "plan:anon:" } } });

  console.log(`\nPlan writing: ${passed} checks passed`);
  await db.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await db.$disconnect();
  process.exit(1);
});
