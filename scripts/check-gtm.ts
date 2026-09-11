// Checks the Tag Manager container and the niche mapping.
//
//   npm run check:gtm
//
// Three classes of failure here are silent, which is why they are tested
// rather than eyeballed.
//
// A container that imports cleanly but never fires. GTM validates structure,
// not sense: a tag whose firingTriggerId names a trigger that is not in the
// file is accepted and then does nothing, forever, with no error anywhere.
//
// An event name outside a network's standard list. Meta and TikTok both accept
// anything as a *custom* event, which cannot be optimized towards and does not
// appear in the conversion column — so the campaign optimizes for nothing and
// the dashboard looks fine.
//
// And the event id, again: the tag's expression has to produce the same string
// as the server relay, or every online sale is counted twice.

import {
  buildContainer,
  dataLayerSnippet,
  gtmSnippet,
  isGtmContainerId,
} from "@/lib/tracking/gtm";
import {
  GENERAL_NICHE,
  NICHES,
  allNiches,
  classifyNiche,
  nicheById,
  primaryAction,
} from "@/lib/tracking/niches";
import { deriveEventId } from "@/lib/tracking/hash";

let bad = 0;
const ok = (n: string, c: boolean, x = "") => {
  if (!c) {
    bad++;
    console.log(`  FAIL ${n} ${x}`);
  } else console.log(`  ok   ${n}`);
};

// The exact standard lists. Anything outside them is a custom event.
const META_STANDARD = new Set([
  "Purchase", "Lead", "CompleteRegistration", "Contact", "Schedule", "StartTrial",
  "Subscribe", "SubmitApplication", "AddToCart", "InitiateCheckout", "ViewContent",
  "FindLocation", "Search", "Donate", "AddPaymentInfo", "AddToWishlist", "CustomizeProduct",
]);
const TIKTOK_STANDARD = new Set([
  "CompletePayment", "PlaceAnOrder", "SubmitForm", "Contact", "CompleteRegistration",
  "Subscribe", "AddToCart", "InitiateCheckout", "ViewContent", "Download", "Search",
  "ClickButton", "AddPaymentInfo", "AddToWishlist",
]);

console.log("\n— every niche is coherent —");
{
  const ids = new Set<string>();
  for (const niche of allNiches()) {
    ok(`${niche.id}: unique id`, !ids.has(niche.id), niche.id);
    ids.add(niche.id);
    ok(`${niche.id}: has actions`, niche.actions.length > 0);

    const primaries = niche.actions.filter((a) => a.primary);
    // Exactly one, because it is what the campaign optimizes towards. Two
    // would mean the product cannot answer "which one", and none would mean it
    // silently picks the first.
    ok(`${niche.id}: exactly one primary action`, primaries.length === 1, `${primaries.length}`);

    const actionIds = new Set<string>();
    for (const a of niche.actions) {
      ok(`${niche.id}/${a.id}: unique within the niche`, !actionIds.has(a.id));
      actionIds.add(a.id);
      ok(`${niche.id}/${a.id}: real Meta event`, META_STANDARD.has(a.metaEvent), a.metaEvent);
      ok(`${niche.id}/${a.id}: real TikTok event`, TIKTOK_STANDARD.has(a.tiktokEvent), a.tiktokEvent);
      if (a.detection === "url_contains" || a.detection === "click_selector") {
        ok(`${niche.id}/${a.id}: has something to match on`, Boolean(a.match));
      }
      // A phone tap has no money attached and must not pretend to. A made-up
      // value teaches the network to chase the wrong people.
      if (a.detection === "phone_click" || a.detection === "email_click") {
        ok(`${niche.id}/${a.id}: a tap carries no value`, !a.hasValue);
      }
    }
  }
}

console.log("\n— classifying a business from what they typed —");
{
  const cases: [string, string][] = [
    ["Dental practice", "health_clinic"],
    ["emergency plumber", "home_services"],
    ["Online shop selling candles", "ecommerce"],
    ["Italian restaurant", "restaurant"],
    ["CrossFit gym", "fitness"],
    ["Hair salon and barber", "beauty"],
    ["Family law solicitor", "professional"],
    ["Estate agent", "real_estate"],
    ["Driving instructor", "education"],
    ["B2B SaaS platform", "saas"],
    ["MOT and tyres", "automotive"],
    ["Wedding venue", "events"],
  ];
  for (const [text, expected] of cases) {
    const got = classifyNiche(text);
    ok(`"${text}" → ${expected}`, got.id === expected, `got ${got.id}`);
  }

  // Regressions. Both of these were real: "barber" matched the restaurant
  // keyword "bar", and "coffee shop" matched the shop keyword "coffee" because
  // ecommerce is checked first. Either would have handed a business a set of
  // conversions it can never fire, with nothing in the product looking wrong.
  ok('"barber" is not a bar', classifyNiche("barber").id === "beauty");
  ok('"coffee shop" is not an online shop', classifyNiche("coffee shop").id === "restaurant");
  ok(String.raw`"publishing" does not match the pub keyword`, classifyNiche("publishing house").id !== "restaurant");
  // A stem still covers its family, which is the point of allowing suffixes.
  ok('"plumbing" matches the "plumb" stem', classifyNiche("plumbing").id === "home_services");
  ok('"orthodontist" matches "orthodont"', classifyNiche("orthodontist").id === "health_clinic");
  ok('"consultant" matches "consult"', classifyNiche("consultant").id === "professional");

  ok("nothing typed falls back to general", classifyNiche(null).id === "general");
  ok("gibberish falls back to general", classifyNiche("asdfgh").id === "general");
  // The goal is a weaker signal than the industry, but a real one.
  ok("no industry but selling → ecommerce", classifyNiche(null, "SALES").id === "ecommerce");
  ok("no industry, leads goal → general", classifyNiche(null, "LEADS").id === "general");
  ok("an unknown niche id resolves to general", nicheById("not-a-niche").id === "general");
  ok("the general fallback is genuinely useful", GENERAL_NICHE.actions.length >= 3);
}

console.log("\n— the container GTM will actually import —");
{
  const niche = NICHES.find((n) => n.id === "ecommerce")!;
  const container = buildContainer({
    businessName: "Marlow & Co",
    niche,
    metaPixelId: "111222333444555",
    tiktokPixelId: "CABC123DEF456",
  }) as Record<string, never>;

  const version = container.containerVersion as unknown as {
    tag: { tagId: string; name: string; firingTriggerId: string[]; parameter: { key?: string; value?: string }[] }[];
    trigger: { triggerId: string; name: string }[];
    variable: { variableId: string; name: string }[];
    builtInVariable: { type: string }[];
  };

  ok("export format version is 2", (container as unknown as { exportFormatVersion: number }).exportFormatVersion === 2);
  ok("has tags", version.tag.length > 0);
  ok("has triggers", version.trigger.length > 0);

  // The silent killer: a tag pointing at a trigger that is not in the file.
  const triggerIds = new Set(version.trigger.map((t) => t.triggerId));
  // GTM's own All Pages id is always present in the destination container.
  triggerIds.add("2147479553");
  let dangling = 0;
  for (const tag of version.tag) {
    for (const id of tag.firingTriggerId) if (!triggerIds.has(id)) dangling++;
  }
  ok("no tag fires on a trigger that doesn't exist", dangling === 0, `${dangling} dangling`);

  const tagIds = new Set(version.tag.map((t) => t.tagId));
  ok("tag ids are unique", tagIds.size === version.tag.length);
  const trigIds = new Set(version.trigger.map((t) => t.triggerId));
  ok("trigger ids are unique", trigIds.size === version.trigger.length);

  // Every variable a tag references has to be declared, or it resolves to
  // nothing and the tag fires with an undefined value.
  const declared = new Set(version.variable.map((v) => v.name));
  const html = version.tag
    .map((t) => t.parameter.find((p) => p.key === "html")?.value ?? "")
    .join("\n");
  const referenced = [...html.matchAll(/\{\{([^}]+)\}\}/g)].map((m) => m[1]);
  const builtIn = new Set(["Page URL", "Click URL", "Click Element", "Click Text", "Event"]);
  const missing = referenced.filter((r) => !declared.has(r) && !builtIn.has(r));
  ok("every variable a tag uses is declared", missing.length === 0, missing.join(", "));

  ok("base pixels fire on all pages",
    version.tag.filter((t) => t.firingTriggerId.includes("2147479553")).length === 2);
  ok("both pixel ids are in the file",
    html.includes("111222333444555") && html.includes("CABC123DEF456"));

  // One tag per network per action, plus the two base tags.
  ok("a tag per network per conversion",
    version.tag.length === niche.actions.length * 2 + 2, `${version.tag.length}`);

  ok("every tag is named so the customer can tell them apart",
    version.tag.every((t) => t.name.startsWith("MAIRO - ")));

  // The event id expression has to produce what the server relay produces.
  const expr = /'mairo_' \+ String\(id\)\.replace\(\/\[\^A-Za-z0-9_-\]\/g, ''\)/;
  ok("tags build the same event id the server does", expr.test(html));
  const browserWould = "mairo_" + String("ORD-99").replace(/[^A-Za-z0-9_-]/g, "");
  ok("and that rule agrees with deriveEventId", browserWould === deriveEventId("ORD-99"));

  ok("a valued conversion sends value and currency", html.includes("{{MAIRO - Order value}}"));
  ok("it survives JSON round-tripping", (() => {
    try { JSON.parse(JSON.stringify(container)); return true; } catch { return false; }
  })());
}

console.log("\n— a container for a business with one network only —");
{
  const niche = nicheById("home_services");
  const metaOnly = buildContainer({
    businessName: "Bolt Plumbing",
    niche,
    metaPixelId: "999",
    tiktokPixelId: null,
  }) as unknown as { containerVersion: { tag: { name: string }[] } };

  const names = metaOnly.containerVersion.tag.map((t) => t.name);
  ok("no TikTok tags when there is no TikTok pixel", !names.some((n) => n.includes("TikTok")));
  ok("one Meta tag per action, plus the base",
    names.length === niche.actions.length + 1, `${names.length}`);
  // A trades business converts on the phone. If this ever stopped being the
  // primary, the campaigns would optimize for the wrong thing entirely.
  ok("the phone tap is what it optimizes for", primaryAction(niche).id === "phone_call");
}

console.log("\n— the snippets —");
{
  ok("a lead-only niche needs no dataLayer", dataLayerSnippet(nicheById("home_services")) === null);
  const shop = dataLayerSnippet(nicheById("ecommerce"));
  ok("a shop does need one", shop !== null);
  ok("and it asks for the order id", Boolean(shop && shop.includes("order_id")));

  const snip = gtmSnippet("gtm-abc1234");
  ok("the GTM snippet upper-cases the id", snip.includes("GTM-ABC1234"));
  ok("and includes the noscript half", snip.includes("<noscript>"));

  ok("a real container id is accepted", isGtmContainerId("GTM-ABC1234"));
  ok("lowercase is accepted", isGtmContainerId("gtm-abc1234"));
  ok("a pixel id is not a container id", !isGtmContainerId("111222333444555"));
  ok("nonsense is refused", !isGtmContainerId("hello"));
}

console.log(bad === 0 ? "\nAll checks passed.\n" : `\n${bad} FAILED\n`);
process.exit(bad === 0 ? 0 : 1);
