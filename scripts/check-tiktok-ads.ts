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
        if (path === "/campaign/create/") return reply({ campaign_id: "1800000000000001" });
        if (path === "/advertiser/info/") return reply({ list: [{ timezone: "America/Chicago" }] });
        if (path === "/tool/targeting/search/") return reply({ targeting_tag_list: [{ name: "Austin", geo: { geo_id: "4671654", geo_type: "CITY", region_code: "US" } }] });
        if (path === "/adgroup/create/") return reply({ adgroup_id: "1800000000000002" });
        if (path === "/identity/get/") return reply({ identity_list: [] });
        if (path === "/file/image/ad/upload/") return reply({ image_id: form?.upload_type === "UPLOAD_BY_FILE" ? "avatar-img" : "cover-img" });
        if (path === "/identity/create/") return reply({ identity_id: "identity-1" });
        if (path === "/file/video/ad/upload/") return reply([{ video_id: "v-1" }]);
        if (path === "/file/video/ad/info/") return reply({ list: [{ video_id: "v-1", displayable: true }] });
        if (path === "/ad/create/") return reply({ ad_ids: ["1800000000000003"] });
        return new Response(JSON.stringify({ code: 40002, message: `unexpected ${path}`, data: {} }), { status: 200 });
      }) as typeof fetch;

      try {
        const { tiktokAdapter } = await import("@/lib/ad-platforms/tiktok/adapter");
        const campaign = await tiktokAdapter.createCampaign({
          organizationId: org.id, name: "Test", goal: "SALES", dailyBudgetCents: 2500,
          hasConversionTracking: true, conversionEvent: "CompletePayment",
        });
        ok("the campaign is created", campaign.ok);
        const cBody = calls.find((c) => c.path === "/campaign/create/")?.body as Record<string, unknown>;
        ok("as a website-conversions campaign, $25 a day, switched off", cBody?.objective_type === "WEB_CONVERSIONS" && cBody.budget === "25.00" && cBody.budget_mode === "BUDGET_MODE_DAY" && cBody.operation_status === "DISABLE", cBody);
        ok("authenticated by header", calls[0]?.token === "tt-token");

        const group = await tiktokAdapter.createAdGroup({
          organizationId: org.id, externalCampaignId: "1800000000000001", name: "Test — audience", dailyBudgetCents: 2500, goal: "SALES",
          conversion: { pixelId: "PIXEL1", event: "CompletePayment" },
          destination: { type: "WEBSITE", url: "https://example.test/shop" },
          audience: { geoKey: "2418779", geoLabel: "Austin, Texas, United States", geoRadius: 10, ageMin: 25, ageMax: 40, genders: 2 },
        });
        ok("the ad group is created", group.ok, group);
        const g = calls.find((c) => c.path === "/adgroup/create/")?.body as Record<string, unknown>;
        ok("in Austin, found through TikTok's own location search", JSON.stringify(g?.location_ids) === JSON.stringify(["4671654"]), g?.location_ids);
        ok("ages 25–44, women", JSON.stringify(g?.age_groups) === JSON.stringify(["AGE_25_34", "AGE_35_44"]) && g?.gender === "GENDER_FEMALE");
        ok("optimising for purchases on the pixel", g?.optimization_goal === "CONVERT" && g?.billing_event === "OCPM" && g?.pixel_id === "PIXEL1" && g?.optimization_event === "SHOPPING");
        ok("with every field TikTok requires", ["promotion_type", "placements", "bid_type", "pacing", "schedule_type", "schedule_start_time", "budget", "budget_mode"].every((k) => g && k in g), g);
        ok("and none of Meta's targeting", g && !("geo_locations" in g) && !("age_min" in g));
        ok("switched off", g?.operation_status === "DISABLE");

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
        ok("the video ad is created", ad.ok && ad.data.externalId === "1800000000000003", ad);
        const idCreate = calls.find((c) => c.path === "/identity/create/")?.body as Record<string, unknown>;
        ok("under the business's own name and a generated picture", idCreate?.display_name === "Sunrise Dental" && idCreate?.image_uri === "avatar-img", idCreate);
        const vUp = calls.find((c) => c.path === "/file/video/ad/upload/")?.form;
        ok("the video is uploaded by its address", vUp?.upload_type === "UPLOAD_BY_URL" && vUp.video_url?.endsWith("/video.mp4"), vUp);
        const created = (calls.find((c) => c.path === "/ad/create/")?.body as { creatives: Record<string, unknown>[] })?.creatives?.[0];
        ok("as a single video with its cover", created?.ad_format === "SINGLE_VIDEO" && created.video_id === "v-1" && JSON.stringify(created.image_ids) === JSON.stringify(["cover-img"]));
        ok("text without emoji, TikTok's Shop now, to the website", created?.ad_text === "Soft hoodies, made to last" && created.call_to_action === "SHOP_NOW" && created.landing_page_url === "https://example.test/shop", created);
        ok("appearing as that identity", created?.identity_type === "CUSTOMIZED_USER" && created.identity_id === "identity-1");
        const remembered = await db.platformConnection.findUnique({ where: { organizationId_platform: { organizationId: org.id, platform: "TIKTOK" } }, select: { tiktokIdentityId: true } });
        ok("the identity is remembered for next time", remembered?.tiktokIdentityId === "identity-1");

        const noVideo = await tiktokAdapter.createAd({
          organizationId: org.id, externalAdGroupId: "1", name: "x", creative: { aspectRatio: "SQUARE_1_1", primaryText: "x", imageData: "data:image/png;base64,AA" },
          destination: { type: "WEBSITE", url: "https://example.test" },
        });
        ok("a picture-only ad is refused: TikTok needs video", !noVideo.ok && /video/.test(noVideo.error.message));
      } finally {
        globalThis.fetch = realFetch;
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
