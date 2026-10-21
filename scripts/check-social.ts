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
import { ALL_PLANS, FREELANCER_PLANS, LEGACY_PLANS, PLANS } from "@/lib/plans";
import { SOCIAL_TIERS, socialAccessFrom } from "@/lib/social/access";

// The plan Social Manager comes with, named from plans.ts. These labels used
// to say "Pro", then "Scale"; reading the name keeps the next rename honest.
const TOP = PLANS.find((p) => p.tier === "SCALE_V2")!;

let bad = 0;
const ok = (n: string, c: boolean, x = "") => {
  if (!c) {
    bad++;
    console.log(`  FAIL ${n} ${x}`);
  } else console.log(`  ok   ${n}`);
};

console.log("\n— posting is only for subscribers on the earlier Scale plan —");
{
  ok("no plan: no", !DEFAULT_ENTITLEMENTS.NONE.social_posting);
  ok("MAIRO Pro: no", !DEFAULT_ENTITLEMENTS.PRO.social_posting);
  ok(`${TOP.name}: no — social posting isn't sold any more`, !DEFAULT_ENTITLEMENTS.SCALE_V2.social_posting);
  // The earlier plans keep exactly what they had: only the earlier Scale.
  ok("Starter (earlier): no", !DEFAULT_ENTITLEMENTS.STARTER.social_posting);
  ok("Growth (earlier): no", !DEFAULT_ENTITLEMENTS.GROWTH.social_posting);
  ok("Scale (earlier): yes, as bought", DEFAULT_ENTITLEMENTS.SCALE.social_posting);
  ok("Studio: no", !DEFAULT_ENTITLEMENTS.STUDIO.social_posting);
  ok("Agency: no", !DEFAULT_ENTITLEMENTS.AGENCY.social_posting);

  const withPosting = ALL_PLANS.map((p) => p.tier).filter((t) => DEFAULT_ENTITLEMENTS[t].social_posting);
  ok("only the earlier Scale plan includes it", withPosting.join(",") === "SCALE", withPosting.join(","));
  ok("and the access rule names exactly that", SOCIAL_TIERS.join(",") === "SCALE", SOCIAL_TIERS.join(","));
  ok("MAIRO Pro is refused at the gate", !socialAccessFrom({ subscriptionTier: "PRO", subscriptionStatus: "active" }).ok);
  ok(`${TOP.name}, active, is refused`, !socialAccessFrom({ subscriptionTier: "SCALE_V2", subscriptionStatus: "active" }).ok);
  ok("the earlier Scale, past due, is paused", !socialAccessFrom({ subscriptionTier: "SCALE", subscriptionStatus: "past_due" }).ok);
  ok("the earlier Scale keeps it", socialAccessFrom({ subscriptionTier: "SCALE", subscriptionStatus: "active" }).ok);
}

console.log("\n— the pricing cards say the same thing the code does —");
{
  const pro = PLANS.find((p) => p.tier === "PRO")!;
  ok("two plans are sold", PLANS.length === 2, String(PLANS.length));
  ok("MAIRO Pro is first and $139", PLANS[0] === pro && pro.name === "MAIRO Pro" && pro.priceMonthly === 139, `${pro.name} $${pro.priceMonthly}`);
  ok(`${TOP.name} is $299`, TOP.name === "MAIRO Scale" && TOP.priceMonthly === 299, `${TOP.name} $${TOP.priceMonthly}`);
  ok("they climb", pro.priceMonthly < TOP.priceMonthly);

  for (const plan of ALL_PLANS) {
    ok(
      `${plan.name}'s price has at most two decimal places`,
      Math.round(plan.priceMonthly * 100) === plan.priceMonthly * 100,
      `$${plan.priceMonthly}`
    );
  }

  const promises = (p: (typeof PLANS)[number]) => p.features.some((f) => /social manager|instagram content|post approval queue|content calendar|scheduled (instagram|posting)/i.test(f));
  ok("no plan but the earlier Scale promises Social Manager or posting", ![pro, TOP, ...LEGACY_PLANS.filter((p) => p.tier !== "SCALE"), ...FREELANCER_PLANS].some(promises));
  ok(`${TOP.name}'s card doesn't promise it`, !promises(TOP));
  ok("no card mentions TikTok", !ALL_PLANS.some((p) => [p.headline, p.tagline, ...p.features].some((f) => /tiktok/i.test(f))));
}

console.log("\n— Pro and Scale are told apart at a glance —");
{
  const pro = PLANS.find((p) => p.tier === "PRO")!;
  for (const plan of PLANS) {
    ok(`${plan.name} has a headline`, Boolean(plan.headline?.trim()));
    ok(`${plan.name}'s headline is short`, plan.headline.length <= 48, plan.headline);
  }
  ok("the two headlines are different", pro.headline !== TOP.headline);
  ok("Pro inherits nothing", !pro.inherits);
  ok(`${TOP.name} builds on Pro`, TOP.inherits === pro.name, TOP.inherits);
  ok(`${TOP.name} lists only what it adds`, !TOP.features.some((f) => /^Everything in/i.test(f)));
  const repeated = TOP.features.filter((f) => pro.features.includes(f));
  ok(`${TOP.name} repeats nothing from Pro`, repeated.length === 0, repeated.join(","));
}

console.log("\n— the comparison rows come from the entitlements, not from copy —");
{
  const rows = (tier: "PRO" | "SCALE_V2") => Object.fromEntries(planComparison(tier).map((r) => [r.label, r.value]));
  const pro = rows("PRO");
  const scale = rows("SCALE_V2");
  const labels = planComparison("PRO").map((r) => r.label);
  ok("Scale shows the same rows in the same order", planComparison("SCALE_V2").map((r) => r.label).join("|") === labels.join("|"));
  ok("both run Facebook + Instagram", [pro, scale].every((c) => c["Runs ads on"] === "Facebook + Instagram"));
  ok("Pro: you approve every change", pro["MAIRO works on its own"] === "You approve every change", pro["MAIRO works on its own"]);
  ok(`${TOP.name}: Full Autopilot`, scale["MAIRO works on its own"] === "Full Autopilot", scale["MAIRO works on its own"]);
  ok("Pro has no Social Manager", pro["MAIRO Social Manager"] === "No");
  ok(`${TOP.name} doesn't either`, scale["MAIRO Social Manager"] === "No", scale["MAIRO Social Manager"]);
  ok("Pro runs 15 campaigns", pro["Campaigns at once"] === "15", pro["Campaigns at once"]);
  ok(`${TOP.name} is unlimited`, scale["Campaigns at once"] === "Unlimited", scale["Campaigns at once"]);
  ok("and never leak the sentinel", ![pro, scale].some((c) => /Infinity/.test(c["Campaigns at once"])));
  ok("creative counts climb", Number(pro["Creative requests a month"]) < Number(scale["Creative requests a month"]));
  ok("and they match the limits", Number(pro["Creative requests a month"]) === PLANS[0].limits.creativesPerMonth);
  ok("Pro and Scale differ on the rows shown", labels.some((l) => pro[l] !== scale[l]));
}

console.log("\n— the upgrade prompt has wording for the flag —");
{
  ok("social_posting is labelled", Boolean(FLAG_LABELS.social_posting));
  ok(
    "and the label names Social Manager",
    /social manager/i.test(FLAG_LABELS.social_posting) && !/tiktok/i.test(FLAG_LABELS.social_posting),
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
