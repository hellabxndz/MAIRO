// Checks the landing page's campaign preview and its animated story:
//
//   - the preview is built only from facts the website said or the visitor
//     confirmed — gaps stay empty and are asked about, never guessed;
//   - three directions when the facts allow, exactly one recommended, no
//     invented numbers, no forecasts, no place named twice;
//   - the right event is "needed" for each goal, and the steps before launch
//     include the visitor's approval and the subscription, at the real price;
//   - the story's 24-second timeline: the seven scenes with the agreed
//     wording, six chapters, every fully visible element inside the stage and
//     clear of the "sample data" label and the caption, in both compositions,
//     and captions that match the scenes;
//   - each story example's script: services go lead → qualified → booked,
//     the shop purchase → confirmed order value; a recommendation with
//     evidence; and the video edit it shows is one the real editor and
//     renderer accept (trim to the demonstration, a caption, 9:16).
//
//   npm run check:preview   (reads the fixture websites in scripts/fixtures/sites; no network, no database)

import assert from "node:assert/strict";
import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { scanWebsite } from "../src/lib/website/scan";
import { buildPreview, emptyFacts, factsFromScan, missingFacts, type PreviewFacts } from "../src/lib/preview/build";
import { exampleFacts } from "../src/lib/preview/example";
import { EXAMPLES, EXAMPLE_ORDER, HERO_ORDER, PREVIEW_EXAMPLE } from "../src/lib/demo/examples";
import { CHAPTERS, HERO_DURATION, HERO_SCENES, STAGE, boxes, captionsVtt, restingTime, sceneAt, type ElementId, type Layout } from "../src/lib/demo/timeline";
import { editsNotInFile, parseEdits, playedRange } from "../src/lib/suggested-ads/video";
import { renderPlan } from "../src/lib/suggested-ads/render";
import { PLANS, PRO_TRIAL_DAYS } from "../src/lib/plans";
import { RENDERED_MEDIA } from "../src/lib/demo/media";
import { WALK_CAMERA, WALK_CAPTIONS, WALK_CHAPTERS, WALK_CURSOR, WALK_DURATION, WALK_ONSCREEN, WALK_SCENES, WALK_STAGE, WALK_T, walkCaptionsVtt, walkRestingTime, walkSceneAt } from "../src/lib/demo/walkthrough";

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
    assert.ok(sub.detail.includes(`${PRO_TRIAL_DAYS}-day trial`), sub.detail);
    assert.match(sub.detail, /paid to Meta separately/);
  });
  await check("thin facts still give three concepts — the extra ones from the name and the offer alone — and say which fact would add another", () => {
    const thin: PreviewFacts = { ...emptyFacts(), name: "Rosa's Bakery", offering: "Sourdough bread and birthday cakes", location: "Hackney", businessType: "restaurant", goal: "leads" };
    const t = buildPreview(thin)!;
    assert.equal(t.directions.length, 3);
    for (const d of t.directions.filter((x) => x.angle === "invite" || x.angle === "meet")) {
      assert.deepEqual(d.uses, ["name", "offering"], d.label);
      assert.ok(d.hook.includes("Rosa's Bakery") && /sourdough bread and birthday cakes/i.test(d.hook), d.hook);
    }
    assert.ok(t.couldAdd.length > 0);
  });
  await check("a quick plan needs only the name, the offer and the goal, and says what it went without", () => {
    const quick: PreviewFacts = { ...emptyFacts(), name: "Nova Sports Pitching", offering: "Baseball pitching lessons", goal: "bookings", sources: { name: { from: "you" }, offering: { from: "you" } } };
    assert.equal(buildPreview(quick), null, "the full plan still asks for the area and the industry");
    const q = buildPreview(quick, { quick: true })!;
    assert.equal(q.kind, "appointments", "bookings → a business that takes bookings");
    assert.equal(q.directions.length, 3);
    assert.equal(q.directions.filter((d) => d.recommended).length, 1);
    assert.match(q.plan.audience, /near you$/);
    assert.deepEqual(q.assumed.map((a) => a.key), ["location", "businessType"]);
    const text = JSON.stringify(q);
    assert.doesNotMatch(text, FORECAST);
    for (const n of numbersIn(q.directions.map((d) => d.hook + d.primaryText).join(" "))) assert.fail(`invented number ${n}`);
    assert.equal(buildPreview({ ...quick, goal: "" }, { quick: true }), null, "no goal, no plan");
    assert.equal(buildPreview({ ...quick, offering: "" }, { quick: true }), null, "no offer, no plan");
    assert.equal(buildPreview({ ...quick, goal: "sales" }, { quick: true })!.kind, "shop");
    assert.equal(buildPreview({ ...quick, goal: "leads" }, { quick: true })!.kind, "service");
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
  await check("seven scenes with the agreed wording, back to back over 24 seconds", () => {
    assert.deepEqual(
      HERO_SCENES.map((s) => s.label),
      ["Start with your business.", "Your offer. Your audience. Your goals.", "See what MAIRO recommends—and why.", "Create a new ad. Or improve your footage.", "Your campaign. Your approval.", "See what's working—and what's next.", "What could MAIRO create for your business?"],
    );
    assert.deepEqual(HERO_SCENES.map((s) => [s.start, s.end]), [[0, 4000], [4000, 8000], [8000, 13000], [13000, 17000], [17000, 20000], [20000, 22600], [22600, 24000]]);
    for (let i = 1; i < HERO_SCENES.length; i++) assert.equal(HERO_SCENES[i].start, HERO_SCENES[i - 1].end);
    assert.equal(HERO_DURATION, 24000);
    assert.equal(sceneAt(0).id, "business");
    assert.equal(sceneAt(23999).id, "invite");
  });
  await check("six chapters, each resting on a moment inside its own scene", () => {
    assert.deepEqual(CHAPTERS.map((c) => c.label), ["Business", "Understanding", "Creatives", "Editing", "Approval", "Results"]);
    for (const c of CHAPTERS) assert.equal(sceneAt(restingTime(c.id)).id, c.id);
    assert.equal(sceneAt(restingTime("invite")).id, "invite");
  });
  await check("captions match the scenes", () => {
    const vtt = captionsVtt();
    assert.ok(vtt.startsWith("WEBVTT"));
    for (const s of HERO_SCENES) assert.ok(vtt.includes(s.label), s.label);
    assert.ok(vtt.includes("00:00:22.600 --> 00:00:24.000"));
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
    for (const k of [...EXAMPLE_ORDER, ...HERO_ORDER]) {
      const ex = EXAMPLES[k];
      assert.ok(ex.url.endsWith(".example"));
      for (const m of ex.dashboard.metrics) assert.doesNotMatch(m.label, /revenue|roas|return|customers|profit/i, `${k}: ${m.label}`);
      for (const j of ex.story.journey) assert.doesNotMatch(j.label, /revenue|roas|return|customers|profit/i, `${k}: ${j.label}`);
    }
  });
  await check("the story's three examples: online store, service business, multi-brand team", () => {
    assert.deepEqual(HERO_ORDER.map((k) => EXAMPLES[k].label), ["Online store", "Service business", "Multi-brand team"]);
    // The team example shows one brand and says brand switching and team sign-off aren't offered.
    assert.match(EXAMPLES.brands.note ?? "", /switching between brands/i);
    assert.match(EXAMPLES.brands.note ?? "", /sign-off/i);
    assert.equal(PREVIEW_EXAMPLE.brands, "appointments");
    for (const k of HERO_ORDER) assert.ok(PREVIEW_EXAMPLE[k] && EXAMPLE_ORDER.includes(PREVIEW_EXAMPLE[k]), k);
  });
  await check("results: services go lead → qualified → booked, the store purchase → confirmed order value; every figure says where it comes from", () => {
    assert.deepEqual(EXAMPLES.shop.story.journey.map((j) => j.label), ["Purchases", "Confirmed order value"]);
    for (const k of ["service", "brands"] as const) assert.deepEqual(EXAMPLES[k].story.journey.map((j) => j.label), ["Leads", "Qualified", "Booked"], k);
    for (const k of HERO_ORDER) {
      const s = EXAMPLES[k].story;
      for (const j of s.journey) assert.ok(j.source.trim(), `${k}: ${j.label} has no source`);
      assert.ok(s.recommendation.evidence.length >= 2, `${k}: a recommendation needs its evidence`);
      assert.ok(s.recommendation.approve.trim(), `${k}: the recommendation waits for approval`);
      assert.ok(s.reason.trim() && s.basis.length, `${k}: the recommended test says why`);
    }
    assert.equal(EXAMPLES.service.story.reason, "A demonstration makes your service easier to understand.");
  });
  await check("the video edit the story shows is one the real editor keeps and the real renderer writes", () => {
    for (const k of HERO_ORDER) {
      const v = EXAMPLES[k].story.video;
      const meta = { durationMs: v.lengthS * 1000, width: 1920, height: 1080 };
      const asked = { trimStartMs: v.startsAtS * 1000, trimEndMs: null, captions: [{ startMs: v.startsAtS * 1000, endMs: v.startsAtS * 1000 + 3000, text: v.caption }], aspect: "9:16" };
      const kept = parseEdits(JSON.stringify(asked), meta);
      assert.deepEqual(kept, asked, `${k}: the editor changed the story's edit`);
      assert.equal(playedRange(kept, meta).startMs, v.startsAtS * 1000);
      assert.ok(editsNotInFile(kept).length > 0, `${k}: the edit needs a new file`);
      const plan = renderPlan({ source: "in.mp4", output: "out.mp4", poster: "p.jpg", assPath: "c.ass", fontsDir: "fonts" }, kept, meta);
      assert.ok(plan.hasCaptions, k);
      assert.ok(Math.abs(plan.size.w / plan.size.h - 9 / 16) < 0.01, `${k}: 9:16`); // sides rounded to even pixels
      assert.equal(plan.args[plan.args.indexOf("-ss") + 1], v.startsAtS.toFixed(3), `${k}: starts at the demonstration`);
      assert.equal(plan.lengthMs, (v.lengthS - v.startsAtS) * 1000);
    }
  });

  console.log("— the MAIRO demo —");
  await check("seven chapters in the brief's order and timing, 73 seconds", () => {
    assert.deepEqual(WALK_SCENES.map((s) => [s.id, s.start, s.end]), [["intro", 0, 8000], ["analysis", 8000, 18000], ["plan", 18000, 28000], ["creative", 28000, 42000], ["approval", 42000, 52000], ["results", 52000, 65000], ["ready", 65000, 73000]]);
    assert.equal(WALK_DURATION, 73000);
    assert.ok(WALK_DURATION >= 60000 && WALK_DURATION <= 75000);
    assert.equal(WALK_CHAPTERS.length, 7);
    for (const c of WALK_CHAPTERS) assert.equal(walkSceneAt(walkRestingTime(c.id)).id, c.id);
    assert.deepEqual(WALK_STAGE, { wide: { w: 960, h: 540 }, narrow: { w: 360, h: 640 } }, "16:9 and 9:16");
  });
  await check("the captions are the script, back to back, honest, and the transcript matches the captions file", () => {
    assert.equal(WALK_CAPTIONS[0].start, 0);
    assert.equal(WALK_CAPTIONS[WALK_CAPTIONS.length - 1].end, WALK_DURATION);
    for (let i = 1; i < WALK_CAPTIONS.length; i++) assert.equal(WALK_CAPTIONS[i].start, WALK_CAPTIONS[i - 1].end);
    for (const c of WALK_CAPTIONS) assert.ok(c.end - c.start >= 3500, `${c.text}: on screen long enough to read`);
    const script = WALK_CAPTIONS.map((c) => c.text).join(" ");
    for (const line of [
      "Meet MAIRO, your AI advertising team.",
      "MAIRO reads your website and shows what it found, and where it found it.",
      "Then MAIRO builds your free advertising plan",
      "Three creative concepts, written for your business",
      "With a subscription, MAIRO builds the campaign in your own Meta ad account.",
      "Nothing launches, and nothing is spent, until you approve it.",
      "Your AI advertising team is ready. Build your free ad plan.",
    ]) assert.ok(script.includes(line), line);
    const vtt = walkCaptionsVtt();
    for (const c of WALK_CAPTIONS) assert.ok(vtt.includes(c.text), c.text);
    assert.ok(vtt.includes("00:01:05.000 --> 00:01:13.000"));
    assert.doesNotMatch(script, FORECAST);
    assert.doesNotMatch(script, /tiktok|google ads|ai[- ]generated video|guaranteed/i);
    assert.equal(WALK_ONSCREEN.end, "Your AI Advertising Team Is Ready.");
    assert.equal(WALK_ONSCREEN.cta, "Build My Free Ad Plan");
  });
  await check("the cursor and camera act inside their own scene, in order, with time to see each click", () => {
    for (const s of WALK_SCENES) {
      const cur = WALK_CURSOR[s.id];
      for (let i = 0; i < cur.length; i++) {
        assert.ok(cur[i].cue.length > 0);
        assert.ok(cur[i].at >= s.start && cur[i].at < s.end - 300, `${s.id}: cursor at ${cur[i].at} is inside the scene`);
        if (i) assert.ok(cur[i].at - cur[i - 1].at >= 600, `${s.id}: ${cur[i].at} leaves time after ${cur[i - 1].at}`);
      }
      const cam = WALK_CAMERA[s.id];
      for (let i = 0; i < cam.length; i++) {
        assert.ok(cam[i].at >= s.start - 400 && cam[i].at < s.end, `${s.id}: camera at ${cam[i].at} is inside the scene`);
        assert.ok(cam[i].zoom >= 1 && cam[i].zoom <= 1.6 && (cam[i].narrowZoom ?? 1) <= 1.2, `${s.id}: zoom stays readable`);
        if (i) assert.ok(cam[i].at > cam[i - 1].at, `${s.id}: camera keys in order`);
      }
    }
    // Each click lands where the story says it happens.
    assert.ok(WALK_CURSOR.intro.some((k) => k.click && k.at === WALK_T.submit));
    assert.ok(WALK_CURSOR.analysis.some((k) => k.click && k.at === WALK_T.build));
    assert.ok(WALK_CURSOR.approval.some((k) => k.click && k.at === WALK_T.approve));
    assert.ok(WALK_T.typeSite[0] > 3700 && WALK_T.typeSite[1] < WALK_T.goal, "the website is typed after the field is clicked");
    assert.ok(WALK_T.endIn < 65000 && WALK_T.endIn > WALK_CURSOR.results[WALK_CURSOR.results.length - 1].at, "the end screen comes after the last action");
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
