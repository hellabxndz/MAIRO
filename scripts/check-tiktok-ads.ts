/**
 * TikTok ads, checked without a TikTok account.
 *
 *   npm run check:tiktok-ads
 *
 * Two halves. The pure rules (objective, age bands, buttons, ad text) are
 * asserted directly. Then the real adapter is run against a stand-in TikTok
 * API — fetch is intercepted — to prove the exact requests MAIRO sends for a
 * campaign, an ad group and a video ad, field by field. Needs the database
 * (it stores a throwaway TikTok connection for one organization and removes it).
 */
import { db } from "@/lib/db";
import { saveConnection } from "@/lib/ad-platforms/connections";
import {
  tiktokAdText,
  tiktokAgeGroups,
  tiktokCta,
  tiktokDelivery,
  tiktokDisplayName,
  tiktokGender,
  usesSmartPlus,
  US_LOCATION_ID,
} from "@/lib/ad-platforms/tiktok/delivery";
import { makeAvatar } from "@/lib/ad-platforms/tiktok/media";

let bad = 0;
function ok(name: string, cond: unknown, extra?: unknown) {
  if (cond) console.log(`  ok   ${name}`);
  else {
    bad++;
    console.log(`  FAIL ${name}`, extra ?? "");
  }
}

async function main() {
  console.log("\n— goals become TikTok objectives —");
  ok("awareness is reach, paid per thousand views", JSON.stringify(tiktokDelivery("AWARENESS", null)) === JSON.stringify({ objective: "REACH", optimizationGoal: "REACH", billingEvent: "CPM", optimizationEvent: null }));
  ok("sales with a purchase pixel optimises for purchases", tiktokDelivery("SALES", { event: "CompletePayment" }).optimizationEvent === "SHOPPING" && tiktokDelivery("SALES", { event: "CompletePayment" }).objective === "WEB_CONVERSIONS");
  ok("leads with a form pixel optimises for form submits", tiktokDelivery("LEADS", { event: "SubmitForm" }).optimizationEvent === "FORM");
  ok("sales without a pixel runs for website visits", tiktokDelivery("SALES", null).objective === "TRAFFIC" && tiktokDelivery("SALES", null).billingEvent === "CPC");
  ok("an event TikTok doesn't know isn't guessed at", tiktokDelivery("SALES", { event: "SomethingNew" }).objective === "TRAFFIC");
  ok("traffic is clicks", tiktokDelivery("TRAFFIC", { event: "CompletePayment" }).optimizationGoal === "CLICK");

  console.log("\n— which API builds it (TikTok's 2027 cut-off) —");
  ok("website conversions go through Smart+", usesSmartPlus("WEB_CONVERSIONS"));
  ok("traffic stays on the original endpoints", !usesSmartPlus("TRAFFIC"));
  ok("reach stays on the original endpoints", !usesSmartPlus("REACH"));

  console.log("\n— the audience in TikTok's terms —");
  ok("everyone 18+ is no age filter", tiktokAgeGroups(18, 65).length === 0);
  ok("25–40 is two bands", tiktokAgeGroups(25, 40).join() === "AGE_25_34,AGE_35_44");
  ok("50 and over", tiktokAgeGroups(50, 65).join() === "AGE_45_54,AGE_55_100");
  ok("women", tiktokGender(2) === "GENDER_FEMALE");
  ok("everyone", tiktokGender(0) === "GENDER_UNLIMITED");

  console.log("\n— buttons and words —");
  ok("Shop now stays Shop now", tiktokCta("SHOP_NOW") === "SHOP_NOW");
  ok("Meta's Book now becomes TikTok's", tiktokCta("BOOK_TRAVEL") === "BOOK_NOW");
  ok("an unknown button is Learn more", tiktokCta("SEE_MENU") === "LEARN_MORE");
  ok("emoji are removed", tiktokAdText("Fresh bread daily 🍞🔥 come by") === "Fresh bread daily come by");
  const long = tiktokAdText("Handmade sourdough baked every morning in small batches with local flour, sea salt and nothing else at all, ever.");
  ok("text is cut at a word, within 100", long.length <= 100 && !long.endsWith(" ") && long.startsWith("Handmade"), long);
  ok("a name is kept short and plain", tiktokDisplayName("Sunrise Dental 🦷") === "Sunrise Dental");

  const avatar = await makeAvatar("Sunrise Dental");
  ok("the profile picture is a square PNG", avatar.subarray(1, 4).toString() === "PNG" && avatar.readUInt32BE(16) === 512 && avatar.readUInt32BE(20) === 512);

  console.log("\n— the requests the adapter really sends —");
  process.env.TIKTOK_APP_ID ||= "test-app";
  process.env.TIKTOK_APP_SECRET ||= "test-secret";
  const org = await db.organization.findFirst({ select: { id: true } });
  if (!org) {
    console.log("  (no organization in the database — skipping the adapter half)");
  } else {
    const had = await db.platformConnection.findUnique({ where: { organizationId_platform: { organizationId: org.id, platform: "TIKTOK" } } });
    if (had) {
      console.log("  (this organization already has a TikTok connection — skipping the adapter half to leave it alone)");
    } else {
      await saveConnection({ organizationId: org.id, platform: "TIKTOK", externalAccountId: "7000000000001", accessToken: "tt-token", scopes: [] });
      const calls: { path: string; body: unknown; form: Record<string, string> | null; token: string | null }[] = [];
      const madeCampaignIds: string[] = [];
      const realFetch = globalThis.fetch;
      globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = new URL(String(input));
        if (!url.hostname.endsWith("tiktok.com")) return realFetch(input, init);
        const path = url.pathname.replace(/^\/open_api\/v[\d.]+/, "");
        let body: unknown = null;
        let form: Record<string, string> | null = null;
        if (init?.body instanceof FormData) {
          form = {};
          for (const [k, v] of init.body.entries()) form[k] = typeof v === "string" ? v : `<file ${(v as File).size}b>`;
        } else if (typeof init?.body === "string") body = JSON.parse(init.body);
        calls.push({ path: `${path}${url.search}`, body, form, token: (init?.headers as Record<string, string>)?.["Access-Token"] ?? null });
        const reply = (data: unknown) => new Response(JSON.stringify({ code: 0, message: "OK", data }), { status: 200 });
        if (path === "/campaign/create/") return reply({ campaign_id: "1700000000000001" });
        if (path === "/smart_plus/campaign/create/") return reply({ campaign_id: "1800000000000001" });
        if (path === "/smart_plus/adgroup/create/") return reply({ adgroup_id: "1800000000000002" });
        if (path === "/smart_plus/ad/create/") return reply({ smart_plus_ad_id: "1800000000000003" });
        if (/^\/(smart_plus\/)?(campaign|adgroup)\/(status\/)?update\/$/.test(path)) return reply({});
        if (path === "/advertiser/info/") return reply({ list: [{ timezone: "America/Chicago" }] });
        if (path === "/tool/targeting/search/") return reply({ targeting_tag_list: [{ name: "Austin", geo: { geo_id: "4671654", geo_type: "CITY", region_code: "US" } }] });
        if (path === "/adgroup/create/") return reply({ adgroup_id: "1700000000000002" });
        if (path === "/identity/get/") return reply({ identity_list: [] });
        if (path === "/file/image/ad/upload/") return reply({ image_id: form?.upload_type === "UPLOAD_BY_FILE" ? "avatar-img" : "cover-img" });
        if (path === "/identity/create/") return reply({ identity_id: "identity-1" });
        if (path === "/file/video/ad/upload/") return reply([{ video_id: "v-1" }]);
        if (path === "/file/video/ad/info/") return reply({ list: [{ video_id: "v-1", displayable: true }] });
        if (path === "/ad/create/") return reply({ ad_ids: ["1700000000000003"] });
        return new Response(JSON.stringify({ code: 40002, message: `unexpected ${path}`, data: {} }), { status: 200 });
      }) as typeof fetch;

      try {
        const { tiktokAdapter } = await import("@/lib/ad-platforms/tiktok/adapter");
        const campaign = await tiktokAdapter.createCampaign({
          organizationId: org.id, name: "Test", goal: "SALES", dailyBudgetCents: 2500,
          hasConversionTracking: true, conversionEvent: "CompletePayment",
        });
        ok("the sales campaign is created, and says it's Smart+", campaign.ok && campaign.data.smartPlus === true, campaign);
        ok("through Smart+, not the endpoint TikTok retires for sales", calls.some((c) => c.path === "/smart_plus/campaign/create/") && !calls.some((c) => c.path === "/campaign/create/"));
        const cBody = calls.find((c) => c.path === "/smart_plus/campaign/create/")?.body as Record<string, unknown>;
        ok("as a website-conversions campaign, $25 a day on the campaign, switched off", cBody?.objective_type === "WEB_CONVERSIONS" && cBody.budget === "25.00" && cBody.budget_mode === "BUDGET_MODE_DAY" && cBody.budget_optimize_on === true && cBody.operation_status === "DISABLE", cBody);
        ok("with a numeric request id TikTok can read as int64", typeof cBody?.request_id === "string" && /^\d{19}$/.test(cBody.request_id as string) && BigInt(cBody.request_id as string) < BigInt("9223372036854775807"), cBody?.request_id);
        ok("authenticated by header", calls[0]?.token === "tt-token");

        // What launch.ts records, so later calls know which API owns it.
        const mc = await db.mairoCampaign.create({ data: { organizationId: org.id, name: "tt-check", objective: "SALES", totalDailyBudgetCents: 2500 } });
        const child = await db.platformCampaign.create({
          data: { mairoCampaignId: mc.id, platform: "TIKTOK", budgetPercent: 100, dailyBudgetCents: 2500, externalCampaignId: "1800000000000001", tiktokSmartPlus: campaign.ok ? campaign.data.smartPlus ?? false : false },
        });
        madeCampaignIds.push(mc.id);

        const group = await tiktokAdapter.createAdGroup({
          organizationId: org.id, externalCampaignId: "1800000000000001", name: "Test — audience", dailyBudgetCents: 2500, goal: "SALES",
          conversion: { pixelId: "PIXEL1", event: "CompletePayment" },
          destination: { type: "WEBSITE", url: "https://example.test/shop" },
          audience: { geoKey: "2418779", geoLabel: "Austin, Texas, United States", geoRadius: 10, ageMin: 25, ageMax: 40, genders: 2 },
        });
        ok("the ad group is created", group.ok, group);
        ok("through Smart+, because its campaign was", calls.some((c) => c.path === "/smart_plus/adgroup/create/") && !calls.some((c) => c.path === "/adgroup/create/"));
        const g = calls.find((c) => c.path === "/smart_plus/adgroup/create/")?.body as Record<string, unknown>;
        const spec = g?.targeting_spec as Record<string, unknown> | undefined;
        ok("in Austin, found through TikTok's own location search", JSON.stringify(spec?.location_ids) === JSON.stringify(["4671654"]), spec);
        ok("ages 25–44, women — inside targeting_spec", JSON.stringify(spec?.age_groups) === JSON.stringify(["AGE_25_34", "AGE_35_44"]) && spec?.gender === "GENDER_FEMALE");
        ok("optimising for purchases on the pixel", g?.optimization_goal === "CONVERT" && g?.billing_event === "OCPM" && g?.pixel_id === "PIXEL1" && g?.optimization_event === "SHOPPING");
        ok("with every field Smart+ requires", ["adgroup_name", "advertiser_id", "billing_event", "campaign_id", "optimization_goal", "promotion_type", "request_id", "schedule_start_time", "schedule_type", "targeting_spec"].every((k) => g && k in g), g);
        ok("no budget of its own (the campaign carries it), no loose targeting", g && !("budget" in g) && !("location_ids" in g) && !("geo_locations" in g));
        ok("switched off", g?.operation_status === "DISABLE");
        await db.platformCampaign.update({ where: { id: child.id }, data: { externalAdGroupId: group.ok ? group.data.externalId : null } });

        const refused = await tiktokAdapter.createAdGroup({
          organizationId: org.id, externalCampaignId: "1", name: "x", dailyBudgetCents: 2500, goal: "LEADS",
          destination: { type: "PHONE_CALL", phone: "5551234567" },
        });
        ok("a phone-call destination is refused plainly", !refused.ok && /website/.test(refused.error.message));

        const ad = await tiktokAdapter.createAd({
          organizationId: org.id, externalAdGroupId: "1800000000000002", name: "Test",
          creative: { aspectRatio: "VERTICAL_9_16", primaryText: "Soft hoodies, made to last 🧵", headline: "Hoodies", cta: "SHOP_NOW" },
          video: { url: "https://x.public.blob.vercel-storage.com/ad-media/o/video.mp4", posterUrl: "https://x.public.blob.vercel-storage.com/ad-media/o/poster.jpg" },
          displayName: "Sunrise Dental",
          destination: { type: "WEBSITE", url: "https://example.test/shop" },
        });
        ok("the video ad is created, with Smart+'s ad id", ad.ok && ad.data.externalId === "1800000000000003", ad);
        const idCreate = calls.find((c) => c.path === "/identity/create/")?.body as Record<string, unknown>;
        ok("under the business's own name and a generated picture", idCreate?.display_name === "Sunrise Dental" && idCreate?.image_uri === "avatar-img", idCreate);
        const vUp = calls.find((c) => c.path === "/file/video/ad/upload/")?.form;
        ok("the video is uploaded by its address", vUp?.upload_type === "UPLOAD_BY_URL" && vUp.video_url?.endsWith("/video.mp4"), vUp);
        ok("through Smart+, not /ad/create/", calls.some((c) => c.path === "/smart_plus/ad/create/") && !calls.some((c) => c.path === "/ad/create/"));
        const spAd = calls.find((c) => c.path === "/smart_plus/ad/create/")?.body as Record<string, unknown>;
        const info = (spAd?.creative_list as { creative_info: Record<string, unknown> }[] | undefined)?.[0]?.creative_info;
        ok("as a single video with its cover", info?.ad_format === "SINGLE_VIDEO" && (info.video_info as Record<string, unknown>)?.video_id === "v-1" && JSON.stringify(info.image_info) === JSON.stringify([{ web_uri: "cover-img" }]), info);
        ok("text without emoji, TikTok's Shop now, to the website", JSON.stringify(spAd?.ad_text_list) === JSON.stringify([{ ad_text: "Soft hoodies, made to last" }]) && JSON.stringify(spAd?.call_to_action_list) === JSON.stringify([{ call_to_action: "SHOP_NOW" }]) && JSON.stringify(spAd?.landing_page_url_list) === JSON.stringify([{ landing_page_url: "https://example.test/shop" }]), spAd);
        ok("appearing as that identity", info?.identity_type === "CUSTOMIZED_USER" && info.identity_id === "identity-1");
        ok("with every field Smart+ requires", spAd && ["ad_name", "adgroup_id", "advertiser_id"].every((k) => k in spAd));

        console.log("\n— managing a Smart+ campaign afterwards —");
        const before = calls.length;
        const resumed = await tiktokAdapter.resumeCampaign({ organizationId: org.id, externalCampaignId: "1800000000000001", externalAdGroupId: "1800000000000002" });
        const paused = await tiktokAdapter.pauseCampaign({ organizationId: org.id, externalCampaignId: "1800000000000001" });
        const budget = await tiktokAdapter.updateBudget({ organizationId: org.id, externalCampaignId: "1800000000000001", dailyBudgetCents: 4000 });
        const after = calls.slice(before).map((c) => c.path);
        ok("resume switches on the ad group then the campaign, through Smart+", resumed.ok && after[0] === "/smart_plus/adgroup/status/update/" && after[1] === "/smart_plus/campaign/status/update/", after);
        ok("pause goes through Smart+", paused.ok && after[2] === "/smart_plus/campaign/status/update/", after);
        ok("a budget change goes through Smart+", budget.ok && after[3] === "/smart_plus/campaign/update/" && (calls[before + 3]?.body as Record<string, unknown>)?.budget === "40.00", after);

        console.log("\n— traffic stays where it was —");
        const t0 = calls.length;
        const traffic = await tiktokAdapter.createCampaign({ organizationId: org.id, name: "Visitors", goal: "TRAFFIC", dailyBudgetCents: 1000 });
        ok("a traffic campaign uses the original endpoint and isn't marked Smart+", traffic.ok && traffic.data.smartPlus === false && calls.slice(t0).some((c) => c.path === "/campaign/create/") && !calls.slice(t0).some((c) => c.path.startsWith("/smart_plus/")), traffic);
        const tGroup = await tiktokAdapter.createAdGroup({ organizationId: org.id, externalCampaignId: "1700000000000001", name: "Visitors — audience", dailyBudgetCents: 1000, goal: "TRAFFIC", destination: { type: "WEBSITE", url: "https://example.test" } });
        const tg = calls.slice(t0).find((c) => c.path === "/adgroup/create/")?.body as Record<string, unknown>;
        ok("and its ad group keeps the original shape (budget, pacing, loose targeting)", tGroup.ok && tg && ["budget", "pacing", "location_ids"].every((k) => k in tg) && !("targeting_spec" in tg), tg);
        const t1 = calls.length;
        await tiktokAdapter.pauseCampaign({ organizationId: org.id, externalCampaignId: "1700000000000001" });
        ok("pausing a campaign MAIRO has no Smart+ record of uses the original endpoint", calls[t1]?.path === "/campaign/status/update/", calls[t1]?.path);
        const remembered = await db.platformConnection.findUnique({ where: { organizationId_platform: { organizationId: org.id, platform: "TIKTOK" } }, select: { tiktokIdentityId: true } });
        ok("the identity is remembered for next time", remembered?.tiktokIdentityId === "identity-1");

        const noVideo = await tiktokAdapter.createAd({
          organizationId: org.id, externalAdGroupId: "1", name: "x", creative: { aspectRatio: "SQUARE_1_1", primaryText: "x", imageData: "data:image/png;base64,AA" },
          destination: { type: "WEBSITE", url: "https://example.test" },
        });
        ok("a picture-only ad is refused: TikTok needs video", !noVideo.ok && /video/.test(noVideo.error.message));
      } finally {
        globalThis.fetch = realFetch;
        await db.mairoCampaign.deleteMany({ where: { id: { in: madeCampaignIds } } });
        await db.platformConnection.deleteMany({ where: { organizationId: org.id, platform: "TIKTOK" } });
      }
    }
  }

  console.log(`\nUS location id is ${US_LOCATION_ID}.`);
  console.log(bad === 0 ? "\nAll checks passed.\n" : `\n${bad} FAILED\n`);
  await db.$disconnect();
  process.exit(bad === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
