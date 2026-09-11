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

import { DEFAULT_ENTITLEMENTS, FLAG_LABELS } from "@/lib/entitlements";
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
    "Growth says where it went instead of going quiet",
    growth.features.some((f) => /posting to your profiles is on Pro/i.test(f))
  );
  ok(
    "Pro's card promises it",
    pro.features.some((f) => /posts to your Instagram and TikTok/i.test(f))
  );

  // TikTok account setup is a different feature and stays on Growth. Easy to
  // sweep along with posting by accident — they were adjacent bullets.
  ok(
    "Growth keeps TikTok account setup",
    DEFAULT_ENTITLEMENTS.GROWTH.tiktok_account_setup &&
      growth.features.some((f) => /sets up your TikTok/i.test(f))
  );
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
