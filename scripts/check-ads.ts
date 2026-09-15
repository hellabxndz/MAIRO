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
import { metaObjectiveFor, metaCampaignBody } from "@/lib/meta/campaigns";
import {
  CHANNEL_LABELS,
  CHANNEL_META,
  normalizePhone,
  normalizeUrl,
  resolveDestination,
} from "@/lib/campaigns/destination";
import { describeGraphError } from "@/lib/meta/client";
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

console.log("\n— the objective and the ad set have to want the same thing —");
{
  // This pair drifting apart cost a real customer a campaign. The ad set has
  // always fallen back to LINK_CLICKS with no pixel; the objective kept asking
  // for OUTCOME_SALES, which obliges the ad set to carry a promoted_object it
  // had none to send. Meta calls that "Invalid parameter" and names no field,
  // so the campaign existed, the ad set did not, and nothing said why.
  const conversionGoals = ["SALES", "LEADS"] as const;

  for (const goal of conversionGoals) {
    ok(
      `${goal} without a pixel does not ask Meta for a conversion objective`,
      metaObjectiveFor(goal, false) === "OUTCOME_TRAFFIC",
      metaObjectiveFor(goal, false)
    );
    ok(
      `${goal} with a pixel still asks for the real thing`,
      metaObjectiveFor(goal, true) === (goal === "SALES" ? "OUTCOME_SALES" : "OUTCOME_LEADS"),
      metaObjectiveFor(goal, true)
    );
  }

  // The goals that never needed a pixel must not have been dragged along.
  for (const goal of ["AWARENESS", "TRAFFIC", "APP_PROMOTION"] as const) {
    ok(
      `${goal} is unaffected by whether a pixel exists`,
      metaObjectiveFor(goal, false) === metaObjectiveFor(goal, true)
    );
  }

  // The default matters: a caller that forgets the flag should ask for the
  // truthful objective, not silently downgrade everybody to traffic.
  ok(
    "the flag defaults to assuming tracking exists",
    metaObjectiveFor("SALES") === "OUTCOME_SALES"
  );
}

console.log("\n— a conversation is a destination that asks for nothing —");
{
  // The Page is already chosen on the Meta connection screen, so this is the
  // one destination MAIRO can offer without asking the business for anything.
  const dm = { type: "DIRECT_MESSAGE" as const };
  ok(
    "it resolves with no value beyond which inbox",
    JSON.stringify(resolveDestination(dm, { type: "WEBSITE" })) ===
      JSON.stringify({ type: "DIRECT_MESSAGE", channel: "MESSENGER" })
  );
  ok(
    "the campaign's type decides, never the business's",
    resolveDestination({ type: "WEBSITE" }, dm) === null,
    "a campaign asking for a website with no URL anywhere is unbuildable, not a DM"
  );
  ok(
    "and it never falls through to needing a website",
    resolveDestination(dm, { type: "WEBSITE", url: "" }) !== null
  );
}

console.log("\n— every inbox is named the same way in all three places —");
{
  // An ad set saying MESSENGER under a creative whose button opens Instagram
  // is accepted by Meta and then delivers to neither properly. The three names
  // live together in CHANNEL_META so they cannot drift; this is the check that
  // they were all filled in.
  for (const channel of ["MESSENGER", "INSTAGRAM", "WHATSAPP"] as const) {
    const m = CHANNEL_META[channel];
    ok(`${channel}: the ad set has a destination type`, m.destinationType.length > 0);
    ok(`${channel}: the button has a call to action`, m.cta.length > 0);
    ok(`${channel}: the button names an app destination`, m.appDestination.length > 0);
    ok(`${channel}: it has a name a person would recognise`, CHANNEL_LABELS[channel].length > 0);
  }

  // Each one has to be distinct, or two channels quietly become the same ad.
  const types = (["MESSENGER", "INSTAGRAM", "WHATSAPP"] as const).map(
    (c) => CHANNEL_META[c].destinationType
  );
  ok("no two inboxes share a destination type", new Set(types).size === 3, types.join(", "));

  const ctas = (["MESSENGER", "INSTAGRAM", "WHATSAPP"] as const).map((c) => CHANNEL_META[c].cta);
  ok("no two inboxes share a button", new Set(ctas).size === 3, ctas.join(", "));

  // The channel travels with the destination, defaulted rather than undefined.
  const resolved = resolveDestination(
    { type: "DIRECT_MESSAGE", channel: "WHATSAPP" },
    { type: "WEBSITE" }
  );
  ok(
    "the chosen inbox survives resolution",
    JSON.stringify(resolved) === JSON.stringify({ type: "DIRECT_MESSAGE", channel: "WHATSAPP" })
  );
  ok(
    "and an unsaid one falls back to Messenger rather than nothing",
    JSON.stringify(resolveDestination({ type: "DIRECT_MESSAGE" }, { type: "WEBSITE" })) ===
      JSON.stringify({ type: "DIRECT_MESSAGE", channel: "MESSENGER" })
  );
}

console.log("\n— the campaign names its own bid strategy —");
{
  // Inherited from the ad account, this is a coin flip. An account defaulting
  // to a capped strategy refuses every ad set MAIRO builds, because a cap needs
  // a bid_amount nobody here can choose for the customer — and the same code
  // worked fine for whoever's account happened to default the other way.
  const body = metaCampaignBody({
    name: "n",
    goal: "SALES",
    dailyBudgetCents: 100,
    hasConversionTracking: false,
  });
  ok("a bid strategy is sent at all", typeof body.bid_strategy === "string");
  ok(
    "it is the one that needs no bid amount",
    body.bid_strategy === "LOWEST_COST_WITHOUT_CAP",
    String(body.bid_strategy)
  );
  ok("no bid_amount is sent with it", body.bid_amount === undefined);
}

console.log("\n— a Graph error says something a person can act on —");
{
  // "Invalid parameter" on its own is unsearchable and unactionable, and it is
  // what Meta returns for most rejections. The fields that explain it were
  // being thrown away.
  const withUserMsg = describeGraphError(
    {
      error: {
        message: "Invalid parameter",
        error_user_title: "Ad set needs a conversion location",
        error_user_msg: "Choose where you want the conversions to happen.",
        code: 100,
        error_subcode: 2446404,
      },
    },
    400
  );
  ok("keeps the sentence Meta wrote for a human", withUserMsg.includes("Choose where"));
  ok("keeps the generic message too", withUserMsg.includes("Invalid parameter"));
  ok("keeps the subcode, which is what makes it searchable", withUserMsg.includes("2446404"));

  const bare = describeGraphError({ error: { message: "Invalid parameter", code: 100 } }, 400);
  ok("falls back to the generic message", bare.includes("Invalid parameter"));
  ok("still reports the code", bare.includes("code 100"));

  ok(
    "a body with no error at all still says something",
    describeGraphError(null, 500).includes("500")
  );
}

console.log("\n— a click has somewhere to go —");
{
  // The website used to be read off the organization without anybody being
  // asked for it, which gave a plumber's customers a homepage when they wanted
  // to ring him, and gave a business with no website no ad at all.
  const web = { type: "WEBSITE" as const };
  const call = { type: "PHONE_CALL" as const };

  ok(
    "a campaign's own answer wins over the business's",
    JSON.stringify(
      resolveDestination({ type: "WEBSITE", url: "shop.com/sale" }, { type: "WEBSITE", url: "shop.com" })
    ) === JSON.stringify({ type: "WEBSITE", url: "https://shop.com/sale" })
  );
  ok(
    "and falls back to the business when the campaign says nothing",
    JSON.stringify(resolveDestination(web, { type: "WEBSITE", url: "shop.com" })) ===
      JSON.stringify({ type: "WEBSITE", url: "https://shop.com/" })
  );
  ok("nothing anywhere is null, not a guess", resolveDestination(web, web) === null);
  ok(
    "a call campaign with no number is null even when a website exists",
    resolveDestination(call, { type: "WEBSITE", url: "shop.com" }) === null
  );
  ok(
    "a call campaign takes the business's number",
    JSON.stringify(resolveDestination(call, { type: "PHONE_CALL", phone: "(555) 123-4567" })) ===
      JSON.stringify({ type: "PHONE_CALL", phone: "+15551234567" })
  );

  // URLs people actually type.
  ok("a bare domain is accepted", normalizeUrl("myshop.com") === "https://myshop.com/");
  ok("a path is kept", normalizeUrl("myshop.com/sale") === "https://myshop.com/sale");
  ok("http is left alone", normalizeUrl("http://myshop.com/") === "http://myshop.com/");
  ok("a hostname with no dot is refused", normalizeUrl("localhost") === null);
  ok("so is empty", normalizeUrl("   ") === null);
  ok("and javascript: is not a destination", normalizeUrl("javascript:alert(1)") === null);

  // Numbers people actually type.
  ok("US ten digits gets a country code", normalizePhone("(555) 123-4567") === "+15551234567");
  ok("dashes and spaces are stripped", normalizePhone("555-123 4567") === "+15551234567");
  ok("a leading 1 is understood", normalizePhone("1 555 123 4567") === "+15551234567");
  ok("an international number is kept", normalizePhone("+44 20 7946 0000") === "+442079460000");
  ok("something too short is refused", normalizePhone("12345") === null);
  ok("and letters are not a number", normalizePhone("call me") === null);
}

console.log(bad === 0 ? "\nAll checks passed.\n" : `\n${bad} FAILED\n`);
process.exit(bad === 0 ? 0 : 1);
