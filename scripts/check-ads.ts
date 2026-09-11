// Checks the pieces that turn a campaign into an ad that can actually run.
//
//   npm run check:ads
//
// Everything here is a pure function whose failure is invisible from the
// dashboard. A campaign with no ad set delivers nothing and looks like one that
// works. An ad set asking for the wrong optimization goal is accepted by Meta
// and then under-delivers forever. A concept whose headline could not be parsed
// would become an ad with a blank line in it, running on the customer's money.

import {
  HEADLINE_MAX,
  META_CTA_TYPES,
  missingForAd,
  parseAdCopy,
} from "@/lib/meta/creative-copy";
import { metaCustomEventType } from "@/lib/meta/creatives";
import { metaAdapter } from "@/lib/ad-platforms/meta/adapter";
import { tiktokAdapter } from "@/lib/ad-platforms/tiktok/adapter";
import { NICHES, primaryAction } from "@/lib/tracking/niches";

let bad = 0;
const ok = (n: string, c: boolean, x = "") => {
  if (!c) {
    bad++;
    console.log(`  FAIL ${n} ${x}`);
  } else console.log(`  ok   ${n}`);
};

// A concept in exactly the shape src/lib/ai/creative.ts asks the model for.
const CONCEPT = `**The idea**
Show the boots caked in mud on a doorstep, then clean thirty seconds later.

**What you'll see**
A close crop of muddy walking boots on a stone step, morning light.

**Headline**
Clean in thirty seconds

**Primary text**
Mud, grass, whatever the weekend threw at them. One rinse and they look new again. Free delivery this week.

**Call to action**
Shop now — people are ready to buy at this point.

**Assumed**
That you deliver nationwide.`;

console.log("\n— pulling the ad copy out of a concept —");
{
  const copy = parseAdCopy(CONCEPT);
  ok("headline found", copy.headline === "Clean in thirty seconds", `${copy.headline}`);
  ok(
    "primary text found",
    copy.primaryText?.startsWith("Mud, grass, whatever") === true,
    `${copy.primaryText}`
  );
  ok("call to action mapped to Meta's enum", copy.callToAction === "SHOP_NOW", `${copy.callToAction}`);
  ok("the mapped CTA is one Meta accepts", META_CTA_TYPES.has(copy.callToAction ?? ""));
  // The headline must not carry the section that follows it.
  ok("headline stops at the next heading", !(copy.headline ?? "").includes("Primary"));
  ok("markdown is stripped", !(copy.primaryText ?? "").includes("**"));
  ok("nothing is missing", missingForAd(copy).length === 0);
}

console.log("\n— concepts the model wrote slightly differently —");
{
  const colon = parseAdCopy("**Headline:** Clean in thirty seconds\n**Primary text:** One rinse.");
  ok("a colon after the heading still parses", colon.headline === "Clean in thirty seconds", `${colon.headline}`);
  ok("and the inline primary text too", colon.primaryText === "One rinse.", `${colon.primaryText}`);

  const hashes = parseAdCopy("## Headline\nBoots, sorted\n\n## Primary text\nOne rinse.");
  ok("markdown headings parse", hashes.headline === "Boots, sorted", `${hashes.headline}`);

  const quoted = parseAdCopy('**Headline**\n"Clean in thirty seconds"');
  ok("surrounding quotes are dropped", quoted.headline === "Clean in thirty seconds", `${quoted.headline}`);
}

console.log("\n— refusing rather than inventing —");
{
  // The single most important behaviour here. A concept MAIRO cannot parse
  // must not become an ad with a placeholder in it, running on real money.
  const none = parseAdCopy("Just some prose with no structure at all.");
  ok("no headline is null, not a guess", none.headline === null);
  ok("no primary text is null", none.primaryText === null);
  ok("and the caller is told what is missing", missingForAd(none).length === 2, JSON.stringify(missingForAd(none)));

  const empty = parseAdCopy(null);
  ok("a missing concept yields nothing", empty.headline === null && empty.primaryText === null);

  const noCta = parseAdCopy("**Headline**\nA\n\n**Primary text**\nB");
  ok("an absent CTA is null, not LEARN_MORE", noCta.callToAction === null);
  // A null CTA is allowed — createAdCreative falls back to LEARN_MORE, which
  // is a real button, rather than refusing the whole ad over it.
  ok("but a missing CTA does not block the ad", missingForAd(noCta).length === 0);

  const long = parseAdCopy(`**Headline**\n${"a".repeat(400)}`);
  ok("an over-long headline is trimmed, not refused", long.headline?.length === HEADLINE_MAX);
}

console.log("\n— the enum Meta wants for the ad set's promoted object —");
{
  // The pixel says "Purchase"; an ad set's promoted_object says "PURCHASE".
  // Sending the pixel's spelling is rejected with an error about an invalid
  // enum that does not say which value was wrong.
  ok("Purchase becomes PURCHASE", metaCustomEventType("Purchase") === "PURCHASE");
  ok("CompleteRegistration becomes COMPLETE_REGISTRATION", metaCustomEventType("CompleteRegistration") === "COMPLETE_REGISTRATION");
  ok("InitiateCheckout becomes INITIATED_CHECKOUT", metaCustomEventType("InitiateCheckout") === "INITIATED_CHECKOUT");
  ok("an unknown event falls back to OTHER", metaCustomEventType("Nonsense") === "OTHER");

  // Every niche's primary conversion must map to something real, because that
  // is what the ad set will be told to chase.
  const REAL = new Set([
    "PURCHASE", "LEAD", "COMPLETE_REGISTRATION", "CONTACT", "SCHEDULE", "START_TRIAL",
    "SUBSCRIBE", "SUBMIT_APPLICATION", "ADD_TO_CART", "INITIATED_CHECKOUT",
    "VIEW_CONTENT", "FIND_LOCATION", "SEARCH", "DONATE",
  ]);
  for (const niche of NICHES) {
    const event = metaCustomEventType(primaryAction(niche).metaEvent);
    ok(`${niche.id}: optimizes for a real Meta event`, REAL.has(event), event);
  }
}

console.log("\n— where each network keeps the budget —");
{
  // Meta rejects an ad set budget under a campaign that has one; TikTok wants
  // the ad group to carry it. Getting either backwards fails every launch.
  ok("Meta puts the budget on the campaign", metaAdapter.budgetLevel === "campaign");
  ok("TikTok puts it on the ad group", tiktokAdapter.budgetLevel === "adgroup");
}

console.log("\n— every adapter still answers the whole interface —");
{
  for (const adapter of [metaAdapter, tiktokAdapter]) {
    for (const method of [
      "connectAccount", "getAccounts", "createCampaign", "createAdGroup", "createAd",
      "updateBudget", "pauseCampaign", "resumeCampaign", "getCampaignPerformance",
      "getCreativePerformance",
    ] as const) {
      ok(
        `${adapter.platform}.${method}`,
        typeof (adapter as unknown as Record<string, unknown>)[method] === "function"
      );
    }
  }
}

console.log(bad === 0 ? "\nAll checks passed.\n" : `\n${bad} FAILED\n`);
process.exit(bad === 0 ? 0 : 1);
