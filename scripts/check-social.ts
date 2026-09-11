// Checks the rules behind MAIRO posting on a customer's own profile.
//
//   npm run check:social
//
// Two kinds of failure are covered here, and they fail in different ways.
//
// The plan gate is the expensive one to get wrong in the quiet direction: a
// Growth customer who can reach the posting endpoint is getting the top plan's
// feature for less, and nothing on any screen would show it.
//
// The image route is the expensive one to get wrong in the loud direction. It
// is deliberately unauthenticated, because Instagram fetches the picture
// itself carrying none of our cookies — so what it will and won't serve is the
// whole of its security, and "it serves images" is not a property you can
// confirm by reading it.

import { DEFAULT_ENTITLEMENTS, FLAG_LABELS, planComparison } from "@/lib/entitlements";
import { CAPTION_MAX, POSTS_PER_DAY } from "@/lib/instagram/constants";
import { PLANS } from "@/lib/plans";

let bad = 0;
const ok = (n: string, c: boolean, x = "") => {
  if (!c) {
    bad++;
    console.log(`  FAIL ${n} ${x}`);
  } else console.log(`  ok   ${n}`);
};

console.log("\n— posting is Pro only —");
{
  ok("no plan: no", !DEFAULT_ENTITLEMENTS.NONE.social_posting);
  ok("Starter: no", !DEFAULT_ENTITLEMENTS.STARTER.social_posting);
  ok("Growth: no", !DEFAULT_ENTITLEMENTS.GROWTH.social_posting);
  ok("Pro: yes", DEFAULT_ENTITLEMENTS.SCALE.social_posting);

  // The freelancer ladder has to agree with the business one, or the same
  // feature costs a different amount depending on which page you bought from.
  ok("Studio mirrors Growth: no", !DEFAULT_ENTITLEMENTS.STUDIO.social_posting);
  ok("Agency mirrors Pro: yes", DEFAULT_ENTITLEMENTS.AGENCY.social_posting);

  // Exactly one business plan has it. A second would make "comes with Pro"
  // false everywhere it is written.
  const withPosting = (["STARTER", "GROWTH", "SCALE"] as const).filter(
    (t) => DEFAULT_ENTITLEMENTS[t].social_posting
  );
  ok("exactly one business plan includes it", withPosting.length === 1, withPosting.join(","));
}

console.log("\n— the pricing cards say the same thing the code does —");
{
  const growth = PLANS.find((p) => p.tier === "GROWTH")!;
  const pro = PLANS.find((p) => p.tier === "SCALE")!;

  ok("Growth is $129", growth.priceMonthly === 129, `$${growth.priceMonthly}`);
  ok("Pro is dearer than Growth", pro.priceMonthly > growth.priceMonthly);
  ok(
    "Starter is cheaper than Growth",
    PLANS.find((p) => p.tier === "STARTER")!.priceMonthly < growth.priceMonthly
  );

  // The cards are what somebody decides on. A feature list still promising
  // Growth customers something the code no longer grants them is the kind of
  // lie that ends in a refund.
  const growthPromises = growth.features.some((f) => /MAIRO posts to your/i.test(f));
  ok("Growth no longer promises posting", !growthPromises);
  ok(
    "Pro's card promises it",
    pro.features.some((f) => /posts to your Instagram and TikTok/i.test(f))
  );
  // Growth used to carry a bullet saying posting lived on Pro. That is now a
  // comparison row on every card — "Posts to your own feed: No" against Pro's
  // "Instagram + TikTok" — which says it in the one place a reader is already
  // comparing, and is derived from the entitlement rather than written by
  // hand. Asserted in the comparison block below, not here.

  // TikTok account setup is a different feature and stays on Growth. Easy to
  // sweep along with posting by accident — they were adjacent bullets.
  ok(
    "Growth keeps TikTok account setup",
    DEFAULT_ENTITLEMENTS.GROWTH.tiktok_account_setup &&
      growth.features.some((f) => /sets up your TikTok/i.test(f))
  );
}

console.log("\n— Starter and Growth are told apart at a glance —");
{
  // The pricing grid was three columns of identically-shaped dashes, and
  // telling Starter from Growth meant diffing fourteen bullets by eye. These
  // assert the things that make the difference legible, because they are copy
  // and copy rots.
  const starter = PLANS.find((p) => p.tier === "STARTER")!;
  const growth = PLANS.find((p) => p.tier === "GROWTH")!;
  const pro = PLANS.find((p) => p.tier === "SCALE")!;

  for (const plan of [starter, growth, pro]) {
    ok(`${plan.name} has a headline`, Boolean(plan.headline?.trim()));
    // Long enough to mean something, short enough to read as a headline.
    ok(`${plan.name}'s headline is short`, plan.headline.length <= 32, plan.headline);
  }
  ok("the three headlines are all different", new Set([starter.headline, growth.headline, pro.headline]).size === 3);

  // Each upper plan names what it contains rather than restating it, so the
  // length of its list is the size of the upgrade.
  ok("Starter inherits nothing", !starter.inherits);
  ok("Growth builds on Starter", growth.inherits === "Starter", growth.inherits);
  ok("Pro builds on Growth", pro.inherits === "Growth", pro.inherits);

  // A restated bullet is the bug this replaced: "Everything in Starter" as a
  // feature, followed by things Starter already had.
  for (const plan of [growth, pro]) {
    ok(
      `${plan.name} lists only what it adds`,
      !plan.features.some((f) => /^Everything in/i.test(f))
    );
  }
  // And nothing inherited should reappear further up the ladder.
  const repeated = growth.features.filter((f) => starter.features.includes(f));
  ok("Growth repeats nothing from Starter", repeated.length === 0, repeated.join(","));
  const repeatedPro = pro.features.filter((f) => growth.features.includes(f));
  ok("Pro repeats nothing from Growth", repeatedPro.length === 0, repeatedPro.join(","));
}

console.log("\n— the comparison rows come from the entitlements, not from copy —");
{
  const rows = (tier: "STARTER" | "GROWTH" | "SCALE") =>
    Object.fromEntries(planComparison(tier).map((r) => [r.label, r.value]));

  const starter = rows("STARTER");
  const growth = rows("GROWTH");
  const pro = rows("SCALE");

  // Every card shows the same rows in the same order, which is what makes the
  // comparison a glance down a column instead of a hunt.
  const labels = planComparison("STARTER").map((r) => r.label);
  for (const tier of ["GROWTH", "SCALE"] as const) {
    ok(
      `${tier} shows the same rows in the same order`,
      planComparison(tier).map((r) => r.label).join("|") === labels.join("|")
    );
  }

  // The one row that separates Starter from Growth.
  ok("Starter runs ads on Meta only", starter["Runs ads on"] === "Meta", starter["Runs ads on"]);
  ok("Growth adds TikTok", growth["Runs ads on"] === "Meta + TikTok", growth["Runs ads on"]);
  ok("and they differ", starter["Runs ads on"] !== growth["Runs ads on"]);

  // The one that separates Growth from Pro.
  ok("Growth does not post for you", growth["Posts to your own feed"] === "No");
  ok(
    "Pro does",
    pro["Posts to your own feed"] === "Instagram + TikTok",
    pro["Posts to your own feed"]
  );

  // The numbers must come from the limits, not be typed twice.
  ok("campaign counts climb", Number(starter["Campaigns at once"]) < Number(growth["Campaigns at once"]) && Number(growth["Campaigns at once"]) < Number(pro["Campaigns at once"]));
  ok("creative counts climb", Number(starter["New ads a month"]) < Number(growth["New ads a month"]) && Number(growth["New ads a month"]) < Number(pro["New ads a month"]));
  ok("and they match the limits", Number(growth["Campaigns at once"]) === PLANS.find((p) => p.tier === "GROWTH")!.limits.campaigns);

  // Every adjacent pair must differ in at least one row, or a card gives a
  // reader no reason to choose it.
  const differs = (a: Record<string, string>, c: Record<string, string>) =>
    labels.some((l) => a[l] !== c[l]);
  ok("Starter and Growth differ on the rows shown", differs(starter, growth));
  ok("Growth and Pro differ on the rows shown", differs(growth, pro));
}

console.log("\n— the upgrade prompt has wording for the flag —");
{
  ok("social_posting is labelled", Boolean(FLAG_LABELS.social_posting));
  ok(
    "and the label names both networks",
    /instagram/i.test(FLAG_LABELS.social_posting) && /tiktok/i.test(FLAG_LABELS.social_posting),
    FLAG_LABELS.social_posting
  );
}

console.log("\n— Instagram's own limits —");
{
  ok("caption ceiling is Instagram's 2200", CAPTION_MAX === 2200);
  ok("daily posts is Instagram's 25", POSTS_PER_DAY === 25);
}

console.log("\n— what the public image route will serve —");
{
  // The route is reachable without a session, so this is the whole of its
  // protection. Re-implemented here rather than imported because the route
  // module pulls in the database client; the patterns are kept identical.
  const DATA_URL = /^data:([a-z0-9.+/-]+);base64,([\s\S]*)$/i;
  const ALLOWED = /^image\/(png|jpeg|jpg|webp|gif)$/i;

  const serves = (value: string): string | null => {
    const m = DATA_URL.exec(value.trim());
    if (!m) return null;
    return ALLOWED.test(m[1]) ? m[1] : null;
  };

  ok("a PNG is served", serves("data:image/png;base64,iVBORw0KGgo=") === "image/png");
  ok("a JPEG is served", serves("data:image/jpeg;base64,/9j/4AAQ") === "image/jpeg");
  ok("a WebP is served", serves("data:image/webp;base64,UklGRg") === "image/webp");

  // The one that matters. Without the allowlist the stored string picks the
  // Content-Type, and a row holding HTML would make MAIRO's own origin serve
  // markup — which is a stored-XSS shape, not a broken picture.
  ok("HTML is refused", serves("data:text/html;base64,PHNjcmlwdD4=") === null);
  ok("SVG is refused", serves("data:image/svg+xml;base64,PHN2Zz4=") === null);
  ok("a PDF is refused", serves("data:application/pdf;base64,JVBERi0=") === null);
  ok("plain text is refused", serves("data:text/plain;base64,aGk=") === null);

  // Not a data URL at all — an https link somebody stored in the column must
  // not be echoed back as though MAIRO had vouched for it.
  ok("a bare URL is refused", serves("https://example.test/x.png") === null);
  ok("an empty value is refused", serves("") === null);

  // Base64 legitimately contains no newlines from our encoder, but a value
  // that arrived wrapped must still parse rather than 415.
  ok(
    "a wrapped payload still parses",
    serves("data:image/png;base64,iVBORw0K\nGgo=") === "image/png"
  );
}

console.log(bad === 0 ? "\nAll checks passed.\n" : `\n${bad} FAILED\n`);
process.exit(bad === 0 ? 0 : 1);
