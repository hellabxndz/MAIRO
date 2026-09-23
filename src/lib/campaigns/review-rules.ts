import type { FundingState } from "@/lib/ad-platforms/billing";
import type { CampaignPlan } from "@/lib/campaigns/plan";
import { LOW_DAILY_CENTS, MIN_DAILY_CENTS, dollars, plannedSpend } from "@/lib/campaigns/plan";
import { goalOption, supportsDestination } from "@/lib/campaigns/objectives";
import type { LandingProbe } from "@/lib/campaigns/landing-probe";
import { checkCopy, maxTestAds, unsupportedNumbers } from "@/lib/campaigns/ad-copy";
import { hasOwnWords, runningCopy } from "@/lib/campaigns/plan";
import { TIKTOK_TEXT_MAX } from "@/lib/ad-platforms/tiktok/delivery";

// The checks run before a campaign is built. Each one is a rule MAIRO can
// actually verify from the plan and the account, not a score. Blocking issues
// stop the build; recommendations are the customer's call.
//
// Kept free of the database and the network so every rule can be asserted in
// scripts/check-campaign-review.ts; review.ts gathers the facts.

export type ReviewStep = "business" | "goal" | "audience" | "budget" | "ad";

export type Finding = {
  id: string;
  severity: "blocking" | "recommendation";
  area: "Account" | "Tracking" | "Destination" | "Budget" | "Audience" | "Advertisement";
  title: string;
  detail: string;
  /** The screen that fixes it, for "Fix with MAIRO". */
  fix: ReviewStep | null;
};

export type ReviewStatus = "READY" | "IMPROVEMENTS" | "SETUP_REQUIRED";

export type ReviewFacts = {
  metaConnected: boolean;
  pageChosen: boolean;
  tiktokConnected: boolean;
  funding: FundingState;
  /** The ad account's billing currency, when Meta said. */
  currency: string | null;
  metaPixelActive: boolean;
  /** An approved picture exists to build a generated ad from. */
  hasApprovedCreative: boolean;
  landing: LandingProbe | null;
};

export function reviewStatus(findings: Finding[]): ReviewStatus {
  if (findings.some((f) => f.severity === "blocking")) return "SETUP_REQUIRED";
  if (findings.length > 0) return "IMPROVEMENTS";
  return "READY";
}

export function reviewFindings(plan: CampaignPlan, facts: ReviewFacts, now: Date = new Date()): Finding[] {
  const out: Finding[] = [];
  const add = (f: Finding) => out.push(f);
  const usesMeta = plan.service !== "tiktok";
  const usesTikTok = plan.service !== "meta";

  // --- Account ------------------------------------------------------------
  if (usesMeta && !facts.metaConnected) {
    add({ id: "meta-not-connected", severity: "blocking", area: "Account", title: "Your Meta account isn't connected", detail: "MAIRO builds the campaign inside your own ad account, so it needs access first. Connect it under Integrations.", fix: null });
  }
  if (usesMeta && facts.metaConnected && !facts.pageChosen) {
    add({ id: "no-page", severity: "blocking", area: "Account", title: "No Facebook Page is chosen", detail: "Every Meta ad is published by a Page. Choose one on the Meta connection screen.", fix: null });
  }
  if (usesTikTok && !facts.tiktokConnected) {
    add({ id: "tiktok-not-connected", severity: "blocking", area: "Account", title: "Your TikTok account isn't connected", detail: "Connect TikTok under Integrations, or run this campaign on Meta only.", fix: null });
  }
  if (usesMeta && facts.metaConnected && (facts.funding === "no_payment_method" || facts.funding === "out_of_credit")) {
    add({ id: "no-funding", severity: "recommendation", area: "Account", title: "Meta can't charge your ad account yet", detail: "The campaign will be built, but it can't run until your Meta ad account has a payment method. Your MAIRO subscription doesn't pay for ads.", fix: null });
  }
  if (usesMeta && facts.funding === "account_disabled") {
    add({ id: "account-disabled", severity: "blocking", area: "Account", title: "Meta has disabled this ad account", detail: "Nothing can run on it until Meta re-enables it. Check Account Quality in Meta Business Suite.", fix: null });
  }
  if (usesMeta && facts.currency && facts.currency !== "USD") {
    add({ id: "currency", severity: "recommendation", area: "Budget", title: `Your ad account bills in ${facts.currency}`, detail: `The amounts here are sent as ${facts.currency}, not dollars — $20 a day means 20 ${facts.currency} a day.`, fix: "budget" });
  }

  // --- Goal and destination -----------------------------------------------
  if (!plan.goal) {
    add({ id: "no-goal", severity: "blocking", area: "Destination", title: "No goal is chosen", detail: "Pick what you want the ad to do.", fix: "goal" });
    return out;
  }
  const goal = goalOption(plan.goal);
  if (goal.metaOnly && usesTikTok) {
    add({ id: "meta-only-goal", severity: "blocking", area: "Destination", title: `"${goal.label}" runs on Meta only`, detail: "Start a Meta campaign for this goal, or choose a different goal.", fix: "goal" });
  }
  if (!plan.destinationType || !supportsDestination(plan.goal, plan.destinationType)) {
    add({ id: "no-destination", severity: "blocking", area: "Destination", title: "Choose where people go", detail: "Pick where someone lands when they tap the ad.", fix: "goal" });
  }
  if (plan.destinationType === "WEBSITE" && !plan.destinationValue.trim()) {
    add({ id: "no-url", severity: "blocking", area: "Destination", title: "Add the page people should visit", detail: "The ad needs a web address to send people to.", fix: "goal" });
  }
  if (plan.destinationType === "PHONE_CALL" && !plan.destinationValue.trim()) {
    add({ id: "no-phone", severity: "blocking", area: "Destination", title: "Add the number people should call", detail: "A call ad needs a phone number.", fix: "goal" });
  }
  if (plan.destinationType === "APP" && (!plan.destinationValue.trim() || !plan.metaAppId.trim())) {
    add({ id: "no-app", severity: "blocking", area: "Destination", title: "Add your app's store link and Meta app id", detail: "Meta needs both to run app ads. The app id is on your app's page at developers.facebook.com.", fix: "goal" });
  }

  const landing = facts.landing;
  if (landing && !landing.ok && landing.reason === "error_status") {
    add({ id: "landing-broken", severity: "blocking", area: "Destination", title: "Your page returns an error", detail: landing.message, fix: "goal" });
  } else if (landing && !landing.ok) {
    add({ id: "landing-unchecked", severity: "recommendation", area: "Destination", title: "MAIRO couldn't open your page", detail: `${landing.message} Open it on your phone before spending money sending people there.`, fix: "goal" });
  } else if (landing && landing.ok && !landing.mobileReady) {
    add({ id: "landing-mobile", severity: "recommendation", area: "Destination", title: "Your page may not work well on phones", detail: "It has no mobile viewport setting, which usually means it shows zoomed out on a phone — where almost everyone will open it.", fix: "goal" });
  }

  // --- Tracking -----------------------------------------------------------
  const tracksConversions = plan.goal === "SALES" || (plan.goal === "LEADS" && plan.destinationType === "WEBSITE");
  if (usesMeta && tracksConversions && !facts.metaPixelActive) {
    add({
      id: "no-tracking",
      severity: "recommendation",
      area: "Tracking",
      title: plan.goal === "SALES" ? "Your website purchase tracking could not be verified" : "Your website lead tracking could not be verified",
      detail: `Meta hasn't seen events from your pixel, so it can't find the people most likely to ${plan.goal === "SALES" ? "buy" : "enquire"}. Until it does, MAIRO optimizes for website visits instead — set up tracking under Tracking to measure real results.${landing && landing.ok && landing.hasMetaPixel ? " Your page does load Meta's pixel, so it may just need events to arrive." : ""}`,
      fix: null,
    });
  }
  if (plan.goal === "TRAFFIC" && (plan.promotes === "PRODUCT" || plan.promotes === "OFFER") && facts.metaPixelActive) {
    add({ id: "traffic-vs-sales", severity: "recommendation", area: "Tracking", title: "You're paying for visits, not purchases", detail: "If your main goal is purchases, choose \"Get More Sales\" — your tracking works, so Meta can look for buyers instead of just clicks.", fix: "goal" });
  }

  // --- Audience -----------------------------------------------------------
  if (plan.specialAdCategory === "ISSUES_ELECTIONS_POLITICS") {
    add({ id: "political", severity: "blocking", area: "Audience", title: "Political ads need Meta's authorization", detail: "Ads about social issues, elections or politics require Meta's ad authorization and a \"Paid for by\" disclaimer, which MAIRO doesn't set up yet.", fix: "audience" });
  } else if (plan.specialAdCategory) {
    add({ id: "special-category", severity: "recommendation", area: "Audience", title: "Special category rules applied", detail: "Meta doesn't allow ads about housing, jobs or credit to target by age or gender, or within less than 15 miles, so MAIRO has widened the audience to match.", fix: "audience" });
  }
  const local = plan.promotes === "SERVICE" || plan.destinationType === "PHONE_CALL";
  if (plan.audienceMode === "manual" && local && !plan.geoKey) {
    add({ id: "local-nationwide", severity: "recommendation", area: "Audience", title: "Your ad would run across the whole country", detail: "For a business customers visit or call, most of that budget reaches people too far away to come. Add your town.", fix: "audience" });
  }
  if (plan.audienceMode === "manual" && plan.geoKey && plan.geoRadius <= 5 && plan.ageMax - plan.ageMin < 15) {
    add({ id: "narrow", severity: "recommendation", area: "Audience", title: "Your audience may be too small", detail: "A 5-mile area and a narrow age range can leave Meta too few people to show the ad to. Widen one of them.", fix: "audience" });
  }

  // --- Budget -------------------------------------------------------------
  const spend = plannedSpend(plan, now);
  if (plan.budgetType === "LIFETIME" && !plan.endOnDate) {
    add({ id: "lifetime-no-end", severity: "blocking", area: "Budget", title: "A total budget needs an end date", detail: "The total is spent by the end date, so pick when the campaign should stop.", fix: "budget" });
  }
  if (spend.perDayCents < MIN_DAILY_CENTS) {
    add({ id: "budget-too-low", severity: "blocking", area: "Budget", title: `${dollars(spend.perDayCents)} a day is too little to deliver`, detail: `Meta needs at least ${dollars(MIN_DAILY_CENTS)} a day to show an ad at all.`, fix: "budget" });
  } else if (spend.perDayCents < LOW_DAILY_CENTS) {
    add({ id: "budget-low", severity: "recommendation", area: "Budget", title: "This budget is on the small side", detail: `At ${dollars(spend.perDayCents)} a day it can take weeks to learn what works. ${dollars(LOW_DAILY_CENTS)} a day or more gives faster, clearer results.`, fix: "budget" });
  }
  if (plan.service === "multi" && (plan.metaPercent < 10 || plan.metaPercent > 90)) {
    add({ id: "lopsided-split", severity: "recommendation", area: "Budget", title: "One network gets almost nothing", detail: "With under 10% of the budget, one side won't get enough delivery to compare. Consider running just one network.", fix: "budget" });
  }

  // --- Advertisement --------------------------------------------------------
  const post = plan.adChoice === "FACEBOOK_POST" || plan.adChoice === "INSTAGRAM_POST";
  if (post && !plan.selectedPost) {
    add({ id: "no-post", severity: "blocking", area: "Advertisement", title: "Pick the post to promote", detail: "You chose to run an existing post but haven't picked which.", fix: "ad" });
  }
  const ownVisual =
    plan.adChoice === "attached" || plan.adChoice === "video" || plan.adChoice === "EXISTING_AD" || plan.adChoice === "images";
  const pictures = plan.adChoice === "images" ? (plan.images ?? []).length : 0;
  if (plan.adChoice === "images" && pictures === 0) {
    add({ id: "no-pictures", severity: "blocking", area: "Advertisement", title: "Add your pictures", detail: "You chose to use your own pictures but haven't added any yet.", fix: "ad" });
  }
  if (plan.adChoice === "EXISTING_AD" && !plan.existingAd) {
    add({ id: "no-existing-ad", severity: "blocking", area: "Advertisement", title: "Pick the ad to run again", detail: "You chose to reuse one of your ads but haven't picked which.", fix: "ad" });
  }
  if (plan.adChoice === "EXISTING_AD" && plan.existingAd) {
    add({ id: "existing-ad-as-is", severity: "recommendation", area: "Advertisement", title: "Your existing ad runs exactly as it was", detail: "Its picture, words and button — including where it sends people — stay as they were. Check that matches the destination you chose here.", fix: "ad" });
  }
  if ((plan.adChoice === "video" && !plan.video) || plan.adChoice === "generate" || plan.adChoice === "upload") {
    add({ id: "ad-unfinished", severity: "blocking", area: "Advertisement", title: "Finish your advertisement", detail: "The ad was started but not finished. Finish it, or pick another way to make it.", fix: "ad" });
  }
  if (plan.adChoice === "video" && plan.video) {
    add({ id: "video-processing", severity: "recommendation", area: "Advertisement", title: "Meta processes videos before they run", detail: "It usually takes a few minutes. If it isn't ready when the campaign is built, MAIRO finishes the ad by itself once it is.", fix: null });
  }
  if (hasOwnWords(plan)) {
    const words = runningCopy(plan);
    if (words.length === 0) {
      add({ id: "no-copy", severity: "blocking", area: "Advertisement", title: "Choose the words for your ad", detail: "Pick one of the versions MAIRO wrote, or write your own.", fix: "ad" });
    }
    const facts_ = [plan.businessName, plan.offering, plan.targetAudience, plan.differentiator, plan.promotesDetail, plan.website].join(" ");
    const seen = new Set<string>();
    words.forEach((w, i) => {
      for (const f of checkCopy(w, plan.destinationType)) {
        if (seen.has(f.text)) continue;
        seen.add(f.text);
        add({
          id: `copy-${seen.size}`,
          severity: f.level === "problem" ? "blocking" : "recommendation",
          area: "Advertisement",
          title: f.level === "problem" ? `Version ${i + 1}'s words need a change` : "A note on the ad's words",
          detail: f.text,
          fix: "ad",
        });
      }
      const numbers = unsupportedNumbers(`${w.headline} ${w.primaryText}`, facts_);
      if (numbers.length) {
        add({ id: `numbers-${i}`, severity: "recommendation", area: "Advertisement", title: "Check the numbers in your ad are true", detail: `The ad mentions ${numbers.slice(0, 3).join(", ")}, which isn't in what you told MAIRO about the business. Prices and offers in ads have to be real.`, fix: "ad" });
      }
    });
    const cap = maxTestAds(plannedSpend(plan, now).perDayCents);
    if (pictures > cap) {
      add({ id: "many-pictures", severity: "recommendation", area: "Budget", title: "A lot of pictures for this budget", detail: `At this budget Meta may show some of your ${pictures} pictures only rarely while it finds the best one. That's fine — or pick your strongest ${cap}.`, fix: "ad" });
    }
    if (plan.testing && pictures <= 1 && words.length > cap) {
      add({ id: "test-too-big", severity: "blocking", area: "Budget", title: "Too many versions for this budget", detail: `At this budget MAIRO can fairly test ${cap} version${cap === 1 ? "" : "s"} — each needs about $5 a day. Run fewer, or raise the budget.`, fix: "ad" });
    }
  }
  // TikTok: video ads that link to a website, and nothing else.
  if (plan.service !== "meta") {
    if (plan.destinationType && plan.destinationType !== "WEBSITE") {
      add({ id: "tiktok-website", severity: "blocking", area: "Destination", title: "TikTok ads link to a website", detail: "TikTok has no call, message or form ads, so a campaign that runs there needs a website as its destination.", fix: "goal" });
    }
    if (plan.adChoice !== "video") {
      add({ id: "tiktok-video", severity: "blocking", area: "Advertisement", title: "TikTok needs a video", detail: "TikTok only runs video ads. Upload a video — vertical, 9 to 30 seconds works best.", fix: "ad" });
    }
    const long = runningCopy(plan).some((w) => w.primaryText.trim().length > TIKTOK_TEXT_MAX);
    if (long) {
      add({ id: "tiktok-text", severity: "recommendation", area: "Advertisement", title: "TikTok shows 100 characters of text", detail: "The text is longer than TikTok allows, so MAIRO trims it at a word there. Shorter text also reads better on a video.", fix: "ad" });
    }
  }
  if (!post && !ownVisual && !facts.hasApprovedCreative) {
    add({ id: "no-creative", severity: "recommendation", area: "Advertisement", title: "There's no approved picture yet", detail: "The campaign and audience will be built, but the ad itself waits until a picture is approved — make one now with AI or upload your own.", fix: "ad" });
  }
  if (plan.goal === "ENGAGEMENT" && plan.destinationType === "POST_ENGAGEMENT" && !post) {
    add({ id: "engagement-new-ad", severity: "recommendation", area: "Advertisement", title: "Engagement works best on a post people already liked", detail: "Promoting an existing post keeps its likes and comments, which makes new people more likely to join in.", fix: "ad" });
  }
  const fullScreen = plan.choosingPlacements && plan.placements.some((p) => p === "STORIES" || p === "REELS");
  if (fullScreen && !post) {
    add({ id: "cropped", severity: "recommendation", area: "Advertisement", title: "Your image may be cropped in Stories and Reels", detail: "Those placements are tall and full-screen. A square picture shows with space around it — make a 9:16 version in Creative Studio for the best fit.", fix: "ad" });
  }

  return out;
}
