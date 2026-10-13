// Checks the landing page's campaign preview and its animated story:
//
//   - the preview is built only from facts the website said or the visitor
//     confirmed — gaps stay empty and are asked about, never guessed;
//   - three directions when the facts allow, exactly one recommended, no
//     invented numbers, no forecasts, no place named twice;
//   - the right event is "needed" for each goal, and the steps before launch
//     include the visitor's approval and the subscription, at the real price;
//   - the story's 20-second timeline: the six scenes with the agreed wording,
//     every fully visible element inside the stage and clear of the "sample
//     data" label and the caption, in both compositions, and captions that
//     match the scenes.
//
//   npm run check:preview   (reads the fixture websites in scripts/fixtures/sites; no network, no database)

import assert from "node:assert/strict";
import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { scanWebsite } from "../src/lib/website/scan";
import { buildPreview, emptyFacts, factsFromScan, missingFacts, type PreviewFacts } from "../src/lib/preview/build";
import { exampleFacts } from "../src/lib/preview/example";
import { EXAMPLES, EXAMPLE_ORDER } from "../src/lib/demo/examples";
import { CHAPTERS, HERO_DURATION, HERO_SCENES, STAGE, boxes, captionsVtt, restingTime, sceneAt, type ElementId, type Layout } from "../src/lib/demo/timeline";
import { PLANS, STARTER_TRIAL_DAYS } from "../src/lib/plans";
import { RENDERED_MEDIA } from "../src/lib/demo/media";
import { WALK_CAPTIONS, WALK_CHAPTERS, WALK_DURATION, WALK_SCENES, walkBoxes, walkCaptionsVtt, walkRestingTime, walkSceneAt, type WalkElement } from "../src/lib/demo/walkthrough";

let passed = 0;
async function check(name: string, fn: () => void | Promise<void>) {
  await fn();
  passed++;
  console.log(`  ok  ${name}`);
}

const SITES = join(process.cwd(), "scripts/fixtures/sites");
const fixtures = async (url: string) => {
  const u = new URL(url);
  if (!u.hostname.endsWith(".fixture.test")) return { ok: false as const, reason: "unreachable" as const, message: "The site didn't answer." };
  try {
    const body = readFileSync(join(SITES, u.hostname, `${u.pathname === "/" ? "index" : u.pathname.replace(/^\/+|\/+$/g, "")}.html`), "utf8");
    return { ok: true as const, status: 200, finalUrl: url, body, contentType: "text/html", bytes: body.length, redirects: [] as string[] };
  } catch {
    return { ok: false as const, reason: "error_status" as const, status: 404, message: "The site answered with an error (404)." };
  }
};
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const read = async (host: string) => (await scanWebsite(host, { fetcher: fixtures as any })).result;

const FORECAST = /\bguarantee|\bwill (get|bring|deliver)\b|\bexpect(ed)? \d|\b\d+\s*(leads|sales|customers|bookings) (a|per|each) (day|week|month)|\broas of\b/i;
const numbersIn = (s: string) => s.match(/\d+(?:[.,]\d+)?/g) ?? [];

(async () => {
  console.log("— facts from a website —");
  const plumber = await read("plumber.fixture.test");
  const pf = factsFromScan(plumber);
  await check("the plumber's site gives name, offer, place, proof and type — each with its source", () => {
    assert.equal(pf.name, "Brightwater Plumbing");
    assert.match(pf.location, /Eastfield/);
    assert.equal(pf.offer, "Free estimate on every job");
    assert.match(pf.proof, /since 2009/);
    assert.equal(pf.businessType, "home_services");
    assert.equal(pf.typeFrom, "website");
    for (const k of ["name", "offering", "location", "offer", "proof"] as const) assert.equal(pf.sources[k]?.from, "website", k);
  });
  await check("what the site doesn't say stays empty — who it's for and the problem are asked, not guessed", () => {
    assert.equal(pf.customer, "");
    assert.equal(pf.problem, "");
    assert.equal(pf.sources.customer, undefined);
  });
  await check("the booking link and the missing pixel are read from the site", () => {
    assert.equal(pf.destinations?.booking, "Calendly");
    assert.equal(pf.pixelSeen, false);
  });
  const shop = await read("shop.fixture.test");
  const sf = factsFromScan(shop);
  await check("a shop is suggested as an online shop with a sales goal", () => {
    assert.equal(sf.businessType, "ecommerce");
    assert.equal(sf.goal, "sales");
    assert.equal(sf.name, "Fernleaf Ceramics");
  });

  console.log("— what has to be confirmed —");
  await check("an empty form asks for name, offer, place, type and goal — and builds nothing", () => {
    const m = missingFacts(emptyFacts()).map((x) => x.key);
    assert.deepEqual(m, ["name", "offering", "location", "businessType", "goal"]);
    assert.equal(buildPreview(emptyFacts()), null);
  });

  console.log("— the preview —");
  const confirmed: PreviewFacts = { ...pf, customer: "Homeowners with a leak or blocked drain", problem: "Leak under the sink", goal: "leads", sources: { ...pf.sources, customer: { from: "you" }, problem: { from: "you" } } };
  const p = buildPreview(confirmed)!;
  await check("three directions, exactly one recommended first test", () => {
    assert.equal(p.directions.length, 3);
    assert.equal(p.directions.filter((d) => d.recommended).length, 1);
    assert.equal(new Set(p.directions.map((d) => d.angle)).size, 3);
  });
  await check("no hook names the town twice", () => {
    for (const d of p.directions) assert.ok((d.hook.match(/Eastfield/g) ?? []).length <= 1, d.hook);
  });
  await check("no invented numbers: every number in a hook is in the confirmed facts", () => {
    const factText = [confirmed.name, confirmed.offering, confirmed.customer, confirmed.location, confirmed.offer, confirmed.proof, confirmed.problem].join(" ");
    for (const d of p.directions) for (const n of numbersIn(d.hook)) assert.ok(factText.includes(n), `${n} in “${d.hook}”`);
  });
  await check("no forecasts anywhere in the preview", () => {
    assert.doesNotMatch(JSON.stringify(p), FORECAST);
  });
  await check("the budget is labelled an example, and the owner sets the real one", () => {
    assert.match(p.plan.budgetWhy, /example/i);
    assert.match(p.plan.budgetWhy, /you set the real amount/i);
  });
  await check("a leads goal makes Lead the needed event", () => {
    assert.match(p.plan.objective, /Leads/);
    const needed = p.tracking.events.filter((e) => e.required).map((e) => e.name);
    assert.deepEqual(needed, ["Lead"]);
  });
  await check("without a working site form, a leads campaign uses Meta's own form — no pixel needed to start", () => {
    const q = buildPreview({ ...confirmed, destinations: { booking: null, form: false, phone: true, checkout: false } })!;
    assert.match(q.plan.destination, /lead form/i);
    assert.match(q.tracking.status, /doesn't need a pixel/);
  });
  await check("a bookings goal needs Schedule; a sales goal needs Purchase", () => {
    const b = buildPreview({ ...confirmed, goal: "bookings" })!;
    assert.deepEqual(b.tracking.events.filter((e) => e.required).map((e) => e.name), ["Schedule"]);
    const s = buildPreview({ ...sf, offering: sf.offering || "Handmade mugs", location: "Ships across the US" })!;
    assert.deepEqual(s.tracking.events.filter((e) => e.required).map((e) => e.name), ["Purchase"]);
  });
  await check("before anything runs: approval of the exact ad and budget, and the subscription at its real price", () => {
    const labels = p.readiness.map((r) => r.label).join(" | ");
    assert.match(labels, /Approve the ad and the budget/);
    const sub = p.readiness.find((r) => r.label === "Subscribe to launch")!;
    assert.ok(sub.detail.includes(`$${PLANS[0].priceMonthly}`), sub.detail);
    assert.ok(sub.detail.includes(`${STARTER_TRIAL_DAYS}-day trial`), sub.detail);
    assert.match(sub.detail, /paid to Meta separately/);
  });
  await check("thin facts give fewer directions and say which fact would add one", () => {
    const thin: PreviewFacts = { ...emptyFacts(), name: "Rosa's Bakery", offering: "Sourdough bread and birthday cakes", location: "Hackney", businessType: "restaurant", goal: "leads" };
    const t = buildPreview(thin)!;
    assert.ok(t.directions.length >= 1 && t.directions.length < 3, String(t.directions.length));
    assert.ok(t.couldAdd.length > 0);
  });
  await check("the three examples build full previews, marked as examples", () => {
    for (const k of EXAMPLE_ORDER) {
      const f = exampleFacts(k);
      assert.ok(Object.values(f.sources).every((s) => s?.from === "example"));
      const e = buildPreview(f)!;
      assert.ok(e, k);
      assert.equal(e.directions.length, 3, k);
      assert.doesNotMatch(JSON.stringify(e), FORECAST);
    }
  });

  console.log("— the story —");
  await check("six scenes with the agreed wording, back to back over 20 seconds", () => {
    assert.deepEqual(
      HERO_SCENES.map((s) => s.label),
      ["Start with your business.", "Build around your offer.", "Explore your campaign.", "Review before launch.", "Understand your results.", "What could MAIRO create for your business?"],
    );
    assert.deepEqual(HERO_SCENES.map((s) => [s.start, s.end]), [[0, 3000], [3000, 6000], [6000, 10000], [10000, 14000], [14000, 18000], [18000, 20000]]);
    assert.equal(HERO_DURATION, 20000);
    assert.equal(sceneAt(0).id, "business");
    assert.equal(sceneAt(19999).id, "invite");
  });
  await check("five chapters, each resting on a moment inside its own scene", () => {
    assert.deepEqual(CHAPTERS.map((c) => c.label), ["Business", "Plan", "Creative", "Approval", "Results"]);
    for (const c of CHAPTERS) assert.equal(sceneAt(restingTime(c.id)).id, c.id);
  });
  await check("captions match the scenes", () => {
    const vtt = captionsVtt();
    assert.ok(vtt.startsWith("WEBVTT"));
    for (const s of HERO_SCENES) assert.ok(vtt.includes(s.label), s.label);
    assert.ok(vtt.includes("00:00:18.000 --> 00:00:20.000"));
  });
  await check("every fully visible element sits inside the stage, below the sample-data label and above the caption", () => {
    const PEEK = new Set<ElementId>(["c0", "c2"]); // the side concepts peek in from the edges on phones
    for (const layout of ["wide", "narrow"] as Layout[]) {
      const { w, h } = STAGE[layout];
      for (let t = 0; t < HERO_DURATION; t += 50) {
        const b = boxes(t, layout);
        for (const [id, x] of Object.entries(b) as [ElementId, (typeof b)[ElementId]][]) {
          if (x.o < 0.95) continue;
          const where = `${layout} ${id} at ${t}ms`;
          assert.ok(x.y >= 44, `${where}: top ${x.y} under the label`);
          assert.ok(x.y + x.h <= h - 36, `${where}: bottom ${x.y + x.h} over the caption`);
          if (layout === "narrow" && PEEK.has(id)) continue;
          assert.ok(x.x >= 0 && x.x + x.w <= w, `${where}: outside the stage`);
        }
      }
    }
  });
  await check("the examples' dashboards show sample activity, never revenue, ROAS or customer counts", () => {
    for (const k of EXAMPLE_ORDER) {
      const ex = EXAMPLES[k];
      assert.ok(ex.url.endsWith(".example"));
      for (const m of ex.dashboard.metrics) assert.doesNotMatch(m.label, /revenue|roas|return|customers|profit/i, `${k}: ${m.label}`);
    }
  });

  console.log("— the 60-second walkthrough —");
  await check("six chapters in the storyboard's order and timing", () => {
    assert.deepEqual(WALK_SCENES.map((s) => [s.id, s.start, s.end]), [["website", 0, 8000], ["facts", 8000, 17000], ["plan", 17000, 27000], ["creative", 27000, 38000], ["approval", 38000, 49000], ["results", 49000, 60000]]);
    assert.equal(WALK_DURATION, 60000);
    assert.equal(WALK_CHAPTERS.length, 6);
    for (const c of WALK_CHAPTERS) assert.equal(walkSceneAt(walkRestingTime(c.id)).id, c.id);
  });
  await check("captions cover every moment, back to back, and the transcript matches the captions file", () => {
    assert.equal(WALK_CAPTIONS[0].start, 0);
    assert.equal(WALK_CAPTIONS[WALK_CAPTIONS.length - 1].end, WALK_DURATION);
    for (let i = 1; i < WALK_CAPTIONS.length; i++) assert.equal(WALK_CAPTIONS[i].start, WALK_CAPTIONS[i - 1].end);
    const vtt = walkCaptionsVtt();
    for (const c of WALK_CAPTIONS) assert.ok(vtt.includes(c.text), c.text);
    assert.ok(vtt.includes("00:00:57.000 --> 00:01:00.000"));
    assert.doesNotMatch(WALK_CAPTIONS.map((c) => c.text).join(" "), FORECAST);
  });
  await check("every fully visible walkthrough element sits inside the stage, below the label and above the captions", () => {
    const PEEK = new Set<WalkElement>(["c0", "c2"]);
    const captionZone = { wide: 56, narrow: 84 };
    for (const layout of ["wide", "narrow"] as Layout[]) {
      const { w, h } = STAGE[layout];
      for (let t = 0; t < WALK_DURATION; t += 50) {
        const b = walkBoxes(t, layout);
        for (const [id, x] of Object.entries(b) as [WalkElement, (typeof b)[WalkElement]][]) {
          if (x.o < 0.95) continue;
          const where = `${layout} ${id} at ${t}ms`;
          assert.ok(x.y >= 44, `${where}: top ${x.y} under the label`);
          assert.ok(x.y + x.h <= h - captionZone[layout], `${where}: bottom ${x.y + x.h} over the captions`);
          if (layout === "narrow" && PEEK.has(id)) continue;
          assert.ok(x.x >= 0 && x.x + x.w <= w, `${where}: outside the stage`);
        }
      }
    }
  });

  console.log("— rendered video —");
  await check("every video the pages offer exists, at the size recorded, with its poster and captions", () => {
    const clips = [...Object.values(RENDERED_MEDIA.story).flatMap((byLayout) => Object.values(byLayout ?? {})), ...Object.values(RENDERED_MEDIA.walkthrough)].filter(Boolean);
    for (const c of clips) {
      const mp4 = join(process.cwd(), "public", c!.mp4);
      assert.ok(existsSync(mp4), c!.mp4);
      assert.equal(statSync(mp4).size, c!.bytes, `${c!.mp4} changed since it was rendered`);
      assert.ok(existsSync(join(process.cwd(), "public", c!.poster)), c!.poster);
    }
    if (Object.keys(RENDERED_MEDIA.story).length) {
      assert.ok(RENDERED_MEDIA.captions.story);
      assert.equal(readFileSync(join(process.cwd(), "public", RENDERED_MEDIA.captions.story!), "utf8"), captionsVtt(), "story captions out of date — re-render");
    }
    if (Object.keys(RENDERED_MEDIA.walkthrough).length) {
      assert.ok(RENDERED_MEDIA.captions.walkthrough);
      assert.equal(readFileSync(join(process.cwd(), "public", RENDERED_MEDIA.captions.walkthrough!), "utf8"), walkCaptionsVtt(), "walkthrough captions out of date — re-render");
    }
    console.log(`      (${clips.length} clips listed)`);
  });

  console.log(`\n${passed} checks passed.`);
  process.exit(0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
