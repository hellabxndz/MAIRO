// Checks for the Create wizard's rules: objectives, destinations, budgets,
// special categories, the shapes Meta is sent, and the pre-launch review.
// Pure — no database, no network. Run with: npm run check:campaign-wizard

import { GOAL_OPTIONS, destinationsFor, recommendedGoal, supportsDestination } from "@/lib/campaigns/objectives";
import { metaObjectiveFor, metaCampaignBody } from "@/lib/meta/campaigns";
import { metaAdSetBody } from "@/lib/ad-platforms/meta/adapter";
import { metaAdCreativeParams } from "@/lib/meta/creatives";
import { newPlan, plannedSpend, type CampaignPlan } from "@/lib/campaigns/plan";
import { restrictForSpecialCategory, normalizeAudience } from "@/lib/campaigns/audience";
import { appStoreUrl, resolveDestination } from "@/lib/campaigns/destination";
import { reviewFindings, reviewStatus, type ReviewFacts } from "@/lib/campaigns/review-rules";
import { checkCopy, ctaChoicesFor, fitCta, maxTestAds, unsupportedNumbers } from "@/lib/campaigns/ad-copy";
import { checkVideo, checkImage, isOwnUpload } from "@/lib/campaigns/media-rules";
import { runningCopy } from "@/lib/campaigns/plan";
import { planAds, planFormEntries } from "@/lib/campaigns/plan-form";
import { explainAdReview } from "@/lib/meta/ad-review";
import { previewSrc } from "@/lib/meta/preview-formats";

let bad = 0;
const ok = (name: string, cond: boolean, extra = "") => {
  if (!cond) bad++;
  console.log(`  ${cond ? "ok  " : "FAIL"} ${name}${!cond && extra ? ` — ${extra}` : ""}`);
};

console.log("\n— every goal launches as the Meta objective it promises —");
for (const g of GOAL_OPTIONS) {
  ok(`${g.label} → ${g.metaObjective}`, metaObjectiveFor(g.goal, true) === g.metaObjective, metaObjectiveFor(g.goal, true));
}
ok("sales without tracking honestly runs as traffic", metaObjectiveFor("SALES", false) === "OUTCOME_TRAFFIC");
ok("engagement is never downgraded", metaObjectiveFor("ENGAGEMENT", false) === "OUTCOME_ENGAGEMENT");
ok("engagement and app are Meta-only", GOAL_OPTIONS.filter((g) => g.metaOnly).map((g) => g.goal).join() === "ENGAGEMENT,APP_PROMOTION");

console.log("\n— only destinations each goal can actually build —");
ok("sales goes to a website only", destinationsFor("SALES").map((d) => d.type).join() === "WEBSITE");
ok("engagement is messages or the post itself", destinationsFor("ENGAGEMENT").map((d) => d.type).join() === "DIRECT_MESSAGE,POST_ENGAGEMENT");
ok("app promotion goes to the app only", destinationsFor("APP_PROMOTION").map((d) => d.type).join() === "APP");
ok("a sales campaign can't ring a phone", !supportsDestination("SALES", "PHONE_CALL"));
ok("a lead campaign can use a form", supportsDestination("LEADS", "LEAD_FORM"));

console.log("\n— the recommended goal follows what they said, never assumes sales —");
ok("an app is recommended app installs", recommendedGoal({ promotes: "APP", defaultDestination: "WEBSITE", hasActivePixel: true }) === "APP_PROMOTION");
ok("a product with working tracking is recommended sales", recommendedGoal({ promotes: "PRODUCT", defaultDestination: "WEBSITE", hasActivePixel: true }) === "SALES");
ok("a product without tracking is recommended visits, not sales", recommendedGoal({ promotes: "PRODUCT", defaultDestination: "WEBSITE", hasActivePixel: false }) === "TRAFFIC");
ok("a business customers call is recommended leads", recommendedGoal({ promotes: "BUSINESS", defaultDestination: "PHONE_CALL", hasActivePixel: false }) === "LEADS");
ok("an existing post is recommended engagement", recommendedGoal({ promotes: "POST", defaultDestination: "WEBSITE", hasActivePixel: true }) === "ENGAGEMENT");

console.log("\n— budgets add up the way the networks spend them —");
const base = newPlan({ service: "meta", businessName: "Test Co", website: "https://x.test", offering: null, targetAudience: null, differentiator: null, messageChannel: "MESSENGER", timeZone: "UTC", metaPercent: 100 });
const now = new Date("2030-01-01T00:00:00Z");
const daily = plannedSpend({ ...base, dailyAmount: 20 }, now);
ok("a daily budget with no end has no maximum", daily.maxCents === null);
ok("and says what 30 days costs", daily.per30DaysCents === 60000);
const tenDays = plannedSpend({ ...base, dailyAmount: 20, endOnDate: true, endLocal: "2030-01-11T00:00" }, now);
ok("a daily budget over 10 days caps at 10 days", tenDays.maxCents === 20000 && tenDays.days === 10, JSON.stringify(tenDays));
const total = plannedSpend({ ...base, budgetType: "LIFETIME", lifetimeAmount: 300, endOnDate: true, endLocal: "2030-01-11T00:00" }, now);
ok("a total budget is its own maximum", total.maxCents === 30000);
ok("and averages per day", total.perDayCents === 3000);

console.log("\n— the campaign Meta is sent —");
const lifetimeBody = metaCampaignBody({ name: "n", goal: "SALES", dailyBudgetCents: 2000, lifetimeBudgetCents: 30000 });
ok("a total budget is sent as lifetime_budget", lifetimeBody.lifetime_budget === 30000 && lifetimeBody.daily_budget === undefined);
ok("a daily budget stays daily", metaCampaignBody({ name: "n", goal: "SALES", dailyBudgetCents: 2000 }).daily_budget === 2000);
const housing = metaCampaignBody({ name: "n", goal: "LEADS", dailyBudgetCents: 2000, specialAdCategory: "HOUSING" });
ok("a special category is declared", JSON.stringify(housing.special_ad_categories) === JSON.stringify(["HOUSING"]));
ok("with the country Meta requires alongside it", JSON.stringify(housing.special_ad_category_country) === JSON.stringify(["US"]));
ok("no category declares none", JSON.stringify(metaCampaignBody({ name: "n", goal: "LEADS", dailyBudgetCents: 1 }).special_ad_categories) === "[]");

console.log("\n— the ad set Meta is sent —");
const adSetBase = { organizationId: "o", externalCampaignId: "c", name: "n", dailyBudgetCents: 2000, campaignOwnsBudget: true, pageId: "PAGE1" };
const messages = metaAdSetBody({ ...adSetBase, goal: "ENGAGEMENT", destination: { type: "DIRECT_MESSAGE", channel: "MESSENGER" } });
ok("message engagement optimizes for conversations", messages.optimization_goal === "CONVERSATIONS");
ok("and names the inbox", messages.destination_type === "MESSENGER");
const onPost = metaAdSetBody({ ...adSetBase, goal: "ENGAGEMENT", destination: { type: "ON_POST" } });
ok("post engagement optimizes for engagement on the post", onPost.optimization_goal === "POST_ENGAGEMENT" && onPost.destination_type === "ON_POST");
const app = metaAdSetBody({ ...adSetBase, goal: "APP_PROMOTION", destination: { type: "APP", storeUrl: "https://apps.apple.com/app/id1", metaAppId: "123456789" } });
ok("an app campaign optimizes for installs", app.optimization_goal === "APP_INSTALLS");
ok("and names the app it promotes", app.promoted_object === JSON.stringify({ application_id: "123456789", object_store_url: "https://apps.apple.com/app/id1" }));
const withPixel = metaAdSetBody({ ...adSetBase, goal: "APP_PROMOTION", conversion: { pixelId: "P", event: "Purchase" }, destination: { type: "APP", storeUrl: "https://apps.apple.com/app/id1", metaAppId: "123456789" } });
ok("a pixel never replaces the app", JSON.parse(String(withPixel.promoted_object)).application_id === "123456789");
const targeting = (b: Record<string, unknown>) => b.targeting as { targeting_automation?: { advantage_audience: number } };
ok("Advantage+ audience is always stated", targeting(onPost).targeting_automation?.advantage_audience === 0);
ok("and on when chosen", targeting(metaAdSetBody({ ...adSetBase, goal: "TRAFFIC", advantageAudience: true })).targeting_automation?.advantage_audience === 1);

console.log("\n— the ad Meta is sent —");
const creativeBase = { adAccountId: "act_1", accessToken: "t", name: "n", pageId: "PAGE1", imageHash: "h", message: "m", headline: "h", callToAction: null };
const appAd = JSON.parse(String(metaAdCreativeParams({ ...creativeBase, destination: { type: "APP", storeUrl: "https://play.google.com/store/apps/details?id=x", metaAppId: "123456789" } }).object_story_spec));
ok("an app ad has an install button", appAd.link_data.call_to_action.type === "INSTALL_MOBILE_APP");
ok("pointing at the app", appAd.link_data.call_to_action.value.application === "123456789");
ok("and links to its store listing", appAd.link_data.link === "https://play.google.com/store/apps/details?id=x");
const postAd = JSON.parse(String(metaAdCreativeParams({ ...creativeBase, destination: { type: "ON_POST" } }).object_story_spec));
ok("an engagement ad has no button", postAd.link_data.call_to_action === undefined);

console.log("\n— app details are checked before anything is built —");
ok("an App Store link is accepted", appStoreUrl("apps.apple.com/us/app/x/id1") !== null);
ok("a Google Play link is accepted", appStoreUrl("https://play.google.com/store/apps/details?id=x") !== null);
ok("any other site is refused", appStoreUrl("https://myapp.com") === null);
ok("an app destination without an app id resolves to nothing", resolveDestination({ type: "APP", url: "https://apps.apple.com/x" }, { type: "WEBSITE" }) === null);

console.log("\n— special categories stay inside Meta's targeting rules —");
const narrow = normalizeAudience({ geoKey: "123", geoLabel: "Austin", geoRadius: 5, ageMin: 25, ageMax: 40, genders: 2 });
const widened = restrictForSpecialCategory(narrow);
ok("all ages", widened.ageMin === 18 && widened.ageMax === 65);
ok("everyone", widened.genders === 0);
ok("at least 15 miles", widened.geoRadius === 15);
ok("nationwide stays nationwide", restrictForSpecialCategory(normalizeAudience({})).geoRadius === null);

console.log("\n— the review blocks what can't launch and only suggests the rest —");
const facts: ReviewFacts = { metaConnected: true, pageChosen: true, tiktokConnected: false, funding: "funded", currency: "USD", metaPixelActive: true, hasApprovedCreative: true, landing: { ok: true, status: 200, finalUrl: "https://x.test/", mobileReady: true, hasMetaPixel: true, title: "x" } };
const ready: CampaignPlan = { ...base, goal: "SALES", destinationType: "WEBSITE", destinationValue: "https://x.test", dailyAmount: 20, promotes: "PRODUCT" };
const idsOf = (p: CampaignPlan, f: ReviewFacts) => reviewFindings(p, f, now).map((x) => x.id);
ok("a complete, tracked campaign is ready", reviewStatus(reviewFindings(ready, facts, now)) === "READY", idsOf(ready, facts).join());
ok("no Meta connection blocks", reviewStatus(reviewFindings(ready, { ...facts, metaConnected: false }, now)) === "SETUP_REQUIRED");
ok("unverified purchase tracking is a recommendation, not a block", idsOf(ready, { ...facts, metaPixelActive: false }).includes("no-tracking") && reviewStatus(reviewFindings(ready, { ...facts, metaPixelActive: false }, now)) === "IMPROVEMENTS");
ok("a broken landing page blocks", reviewStatus(reviewFindings(ready, { ...facts, landing: { ok: false, reason: "error_status", status: 404, message: "404" } }, now)) === "SETUP_REQUIRED");
ok("a page with no mobile setup is flagged", idsOf(ready, { ...facts, landing: { ok: true, status: 200, finalUrl: "x", mobileReady: false, hasMetaPixel: false, title: null } }).includes("landing-mobile"));
ok("a total budget without an end blocks", idsOf({ ...ready, budgetType: "LIFETIME" }, facts).includes("lifetime-no-end"));
ok("under a dollar a day blocks", reviewStatus(reviewFindings({ ...ready, dailyAmount: 0.5 }, facts, now)) === "SETUP_REQUIRED");
ok("political ads block", idsOf({ ...ready, specialAdCategory: "ISSUES_ELECTIONS_POLITICS" }, facts).includes("political"));
ok("engagement on TikTok blocks", idsOf({ ...ready, service: "multi", goal: "ENGAGEMENT", destinationType: "POST_ENGAGEMENT" }, { ...facts, tiktokConnected: true }).includes("meta-only-goal"));
ok("picking a post without choosing one blocks", idsOf({ ...ready, adChoice: "FACEBOOK_POST" }, facts).includes("no-post"));
ok("a local business running nationwide is flagged", idsOf({ ...ready, audienceMode: "manual", promotes: "SERVICE", goal: "LEADS", destinationType: "PHONE_CALL", destinationValue: "5551234567" }, facts).includes("local-nationwide"));
ok("paying for visits with working tracking is flagged", idsOf({ ...ready, goal: "TRAFFIC" }, facts).includes("traffic-vs-sales"));
ok("a non-dollar account is flagged", idsOf(ready, { ...facts, currency: "EUR" }).includes("currency"));
ok("every finding says which screen fixes it or why it can't", reviewFindings({ ...ready, dailyAmount: 2 }, { ...facts, metaPixelActive: false }, now).every((f) => f.title.length > 0 && f.detail.length > 0));

console.log("\n— ad words are checked the way Meta reads them —");
const words = { primaryText: "Warm hoodies made in Austin.", headline: "Heavyweight hoodies", cta: "SHOP_NOW" };
const problems = (w: typeof words, d: Parameters<typeof checkCopy>[1] = "WEBSITE") => checkCopy(w, d).filter((f) => f.level === "problem");
ok("ordinary copy passes", problems(words).length === 0);
ok("empty text is a problem", problems({ ...words, primaryText: "" }).length > 0);
ok("asking about the reader's debt is refused", problems({ ...words, primaryText: "Are you struggling with debt? We can help." }).length > 0);
ok("offering help with debt is fine", problems({ ...words, primaryText: "Friendly help with debt, from a local advisor." }).length === 0);
ok("an unrelated question isn't mistaken for it", problems({ ...words, primaryText: "Are you in Austin? We fix debt paperwork fast." }).length === 0);
ok("\"guaranteed\" gets a note, not a block", checkCopy({ ...words, primaryText: "Guaranteed warm." }, "WEBSITE").some((f) => f.level === "note") && problems({ ...words, primaryText: "Guaranteed warm." }).length === 0);
ok("an engagement ad needs no headline", problems({ ...words, headline: "" }, "POST_ENGAGEMENT").length === 0);
ok("a website ad does", problems({ ...words, headline: "" }).length > 0);
ok("a call ad's only button is Call now", ctaChoicesFor("PHONE_CALL").map((c) => c.value).join() === "CALL_NOW");
ok("a website button survives", fitCta("SHOP_NOW", "WEBSITE") === "SHOP_NOW");
ok("a website button on a call ad becomes Call now", fitCta("SHOP_NOW", "PHONE_CALL") === "CALL_NOW");
ok("a discount the business never mentioned is caught", unsupportedNumbers("Get 20% off today", "We sell hoodies").join() === "20%");
ok("one they did mention isn't", unsupportedNumbers("Get 20% off today", "Spring sale: 20% off hoodies").length === 0);
ok("$5/day can't test", maxTestAds(500) === 1);
ok("$10/day tests two", maxTestAds(1000) === 2);
ok("$30/day tests three", maxTestAds(3000) === 3);

console.log("\n— uploads are checked against Meta's rules before they're sent —");
const vid = { type: "video/mp4", bytes: 20e6, width: 1080, height: 1920, durationSec: 20 };
ok("a vertical 20s MP4 is fine", checkVideo(vid).problems.length === 0 && checkVideo(vid).warnings.length === 0);
ok("an AVI is refused", checkVideo({ ...vid, type: "video/x-msvideo" }).problems.length > 0);
ok("an ultra-wide video is refused", checkVideo({ ...vid, width: 2560, height: 1080 }).problems.length > 0);
ok("a two-minute video gets a note", checkVideo({ ...vid, durationSec: 120 }).warnings.length > 0);
ok("a tiny picture is refused", checkImage({ type: "image/png", bytes: 1e5, width: 400, height: 400 }).problems.length > 0);
ok("only this business's own uploads are accepted", isOwnUpload("https://abc.public.blob.vercel-storage.com/ad-media/org1/video-x.mp4", "org1") && !isOwnUpload("https://abc.public.blob.vercel-storage.com/ad-media/org2/video-x.mp4", "org1") && !isOwnUpload("https://evil.test/ad-media/org1/v.mp4", "org1"));

console.log("\n— the plan becomes the ads that run —");
const options = [
  { angle: "A", primaryText: "One", headline: "H1", cta: "SHOP_NOW" },
  { angle: "B", primaryText: "Two", headline: "H2", cta: "LEARN_MORE" },
  { angle: "C", primaryText: "Three", headline: "H3", cta: "SHOP_NOW" },
];
const withPicture: CampaignPlan = { ...base, goal: "SALES", destinationType: "WEBSITE", destinationValue: "https://x.test", adChoice: "attached", studioAssetId: "asset1", copyOptions: options, chosenCopy: 1 };
ok("one version runs when not testing", runningCopy(withPicture).map((c) => c.angle).join() === "B");
ok("the chosen version leads a test", runningCopy({ ...withPicture, testing: true, testPicks: [0, 2] }).map((c) => c.angle).join() === "B,A,C");
const ads = planAds({ ...withPicture, testing: true, testPicks: [2] }) as { kind: string; studioAssetId: string; headline: string }[];
ok("each tested version is its own ad", ads.length === 2 && ads.every((a) => a.kind === "IMAGE" && a.studioAssetId === "asset1") && ads[0].headline === "H2");
ok("a video carries its upload", (planAds({ ...withPicture, adChoice: "video", video: { url: "u", posterUrl: "p", name: "n", width: 1, height: 1, durationSec: 1, bytes: 1 } }) as { kind: string; videoUrl: string }[])[0].videoUrl === "u");
ok("an existing ad carries only its id", JSON.stringify(planAds({ ...withPicture, adChoice: "EXISTING_AD", existingAd: { id: "123456", name: "Old", thumbnailUrl: null, headline: null, body: null } })) === JSON.stringify([{ kind: "EXISTING_AD", sourceAdId: "123456", sourceAdName: "Old" }]));
ok("\"later\" sends no ads and follows the approved creative", planAds({ ...withPicture, adChoice: "later" }) === null);
ok("the form carries the ads", planFormEntries(withPicture, { draftId: null, now }).some(([k]) => k === "ads"));
ok("a post sends no ads field", !planFormEntries({ ...withPicture, adChoice: "FACEBOOK_POST", selectedPost: { id: "1_2", message: null, imageUrl: null, permalink: null, createdAt: null } }, { draftId: null, now }).some(([k]) => k === "ads"));

console.log("\n— a video ad is built the way Meta expects —");
const videoAd = JSON.parse(String(metaAdCreativeParams({ ...creativeBase, videoId: "V1", destination: { type: "WEBSITE", url: "https://x.test" } }).object_story_spec));
ok("video_data, not link_data", videoAd.video_data?.video_id === "V1" && videoAd.link_data === undefined);
ok("with a thumbnail", videoAd.video_data.image_hash === "h");
ok("and the button carries the link", videoAd.video_data.call_to_action.value.link === "https://x.test");

console.log("\n— the review checks the ad as well —");
ok("a picture with no words chosen blocks", idsOf({ ...ready, adChoice: "attached", studioAssetId: "a" }, facts).includes("no-copy"));
ok("words that ask about the reader block", reviewStatus(reviewFindings({ ...withPicture, copyOptions: [{ ...options[0], primaryText: "Are you overweight? Try our gym." }], chosenCopy: 0 }, facts, now)) === "SETUP_REQUIRED");
ok("an invented discount is flagged", idsOf({ ...withPicture, copyOptions: [{ ...options[0], primaryText: "50% off everything" }], chosenCopy: 0 }, facts).some((id) => id.startsWith("numbers")));
ok("testing three on $10/day blocks", idsOf({ ...withPicture, dailyAmount: 10, testing: true, testPicks: [0, 2] }, facts).includes("test-too-big"));
ok("an unpicked existing ad blocks", idsOf({ ...ready, adChoice: "EXISTING_AD" }, facts).includes("no-existing-ad"));
ok("an attached picture doesn't trip \"no approved picture\"", !idsOf(withPicture, { ...facts, hasApprovedCreative: false }).includes("no-creative"));

console.log("\n— Meta's rejections are explained, not passed on as codes —");
const personal = explainAdReview("DISAPPROVED", { global: { "Personal Attributes": "Ads must not assert or imply personal attributes." } }, null);
ok("a personal-attributes rejection says what to change", personal.state === "REJECTED" && /describe what you offer/.test(personal.action ?? "") && personal.fix === "ad");
ok("a landing-page rejection points at the destination", explainAdReview("DISAPPROVED", { global: { "Non-Functional Landing Page": "The page didn't load." } }, null).fix === "goal");
ok("an undeclared housing ad points at the audience screen", explainAdReview("DISAPPROVED", { global: { "Special Ad Category": "Housing ads must be declared." } }, null).fix === "audience");
ok("an unknown policy is passed through in Meta's words", /Meta's reason: Weird Policy/.test(explainAdReview("DISAPPROVED", { global: { "Weird Policy": "Something." } }, null).explanation ?? ""));
ok("a rejection with no reason still says so", explainAdReview("DISAPPROVED", null, null).explanation !== null);
ok("an ad with issues shows Meta's summary", explainAdReview("WITH_ISSUES", null, [{ error_summary: "Image too small" }]).explanation === "Image too small");
ok("in review is pending", explainAdReview("PENDING_REVIEW", null, null).state === "PENDING");
ok("running is approved", explainAdReview("ACTIVE", null, null).state === "APPROVED");

console.log("\n— previews only ever load Meta's own pages —");
ok("Meta's preview iframe is accepted", previewSrc('<iframe src="https://www.facebook.com/ads/api/preview_iframe.php?d=AQ&amp;t=AQ" width="540"></iframe>') === "https://www.facebook.com/ads/api/preview_iframe.php?d=AQ&t=AQ");
ok("anything else is refused", previewSrc('<iframe src="https://evil.test/x"></iframe>') === null);
ok("a look-alike domain is refused", previewSrc('<iframe src="https://facebook.com.evil.test/x"></iframe>') === null);
ok("plain http is refused", previewSrc('<iframe src="http://www.facebook.com/x"></iframe>') === null);
ok("no iframe, no preview", previewSrc("<div>nothing</div>") === null);

console.log(bad === 0 ? "\nAll checks passed.\n" : `\n${bad} FAILED\n`);
process.exit(bad === 0 ? 0 : 1);
