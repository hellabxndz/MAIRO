// MAIRO's own pixel set up from AIOS (lib/site-tracking.ts siteTarget): read
// from the database when the deployment's variables aren't set, reported to
// with the business's own Meta connection, and off again when turned off.
//
//   npm run check:site-pixel-db   (needs the database)
//
// Meta is stubbed: nothing leaves this machine.

import assert from "node:assert/strict";
import { db } from "../src/lib/db";
import { withGraphTransport } from "../src/lib/meta/client";
import { SITE_PIXEL_SETTING, forgetSiteTarget, reportSiteEvent, siteConversionsOn, siteTarget } from "../src/lib/site-tracking";
import { GET as sitePixelRoute } from "../src/app/api/site-pixel/route";

let passed = 0;
async function check(name: string, fn: () => Promise<void>) {
  await fn();
  passed++;
  console.log(`  ok  ${name}`);
}

const ORG = "check-site-pixel-org";

async function cleanup() {
  await db.siteSetting.deleteMany({ where: { key: SITE_PIXEL_SETTING, value: ORG } });
  await db.organization.deleteMany({ where: { id: ORG } });
}

async function main() {
  delete process.env.NEXT_PUBLIC_META_PIXEL_ID;
  delete process.env.META_CONVERSIONS_TOKEN;
  delete process.env.META_CONVERSIONS_TEST_CODE;
  await cleanup();
  const before = await db.siteSetting.findUnique({ where: { key: SITE_PIXEL_SETTING } });
  if (before) throw new Error("A real site pixel setting exists in this database; not touching it.");
  try {
    await db.organization.create({ data: { id: ORG, name: "MAIRO" } });
    await db.metaAdAccount.create({ data: { organizationId: ORG, metaAdAccountId: "act_555", accessToken: "house-token", status: "CONNECTED" } });
    await db.trackingPixel.create({ data: { organizationId: ORG, platform: "META", externalPixelId: "4242424242", name: "MAIRO pixel", status: "ACTIVE" } });

    await check("nothing set anywhere: off", async () => {
      forgetSiteTarget();
      assert.equal(await siteTarget(), null);
      assert.deepEqual(await (await sitePixelRoute()).json(), { pixelId: null });
    });

    await check("set up from AIOS: the business's pixel, with its Meta connection", async () => {
      await db.siteSetting.create({ data: { key: SITE_PIXEL_SETTING, value: ORG } });
      forgetSiteTarget();
      assert.deepEqual(await siteTarget(), { pixelId: "4242424242", token: "house-token", source: "aios" });
      assert.equal(await siteConversionsOn(), true);
    });

    await check("the browser is given the id only, never the token", async () => {
      const res = await sitePixelRoute();
      const body = await res.text();
      assert.deepEqual(JSON.parse(body), { pixelId: "4242424242" });
      assert.doesNotMatch(body, /house-token/);
      assert.match(res.headers.get("cache-control") ?? "", /s-maxage=300/);
    });

    await check("a sign-up is reported to that pixel with that connection", async () => {
      const calls: string[] = [];
      const fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
        calls.push(`${String(input)} ${String(init?.body ?? "")}`);
        return Response.json({ events_received: 1, messages: [] });
      }) as typeof globalThis.fetch;
      await withGraphTransport({ fetch }, () => reportSiteEvent({ event: "CompleteRegistration", eventId: "reg-db", path: "/sign-up", email: "a@b.co", fromRequest: false }));
      assert.equal(calls.length, 1);
      assert.match(calls[0], /4242424242\/events/);
      assert.match(calls[0], /house-token/);
    });

    await check("the deployment's variables win over AIOS", async () => {
      process.env.NEXT_PUBLIC_META_PIXEL_ID = "1111111111";
      process.env.META_CONVERSIONS_TOKEN = "env-token";
      assert.deepEqual(await siteTarget(), { pixelId: "1111111111", token: "env-token", source: "env" });
      delete process.env.NEXT_PUBLIC_META_PIXEL_ID;
      delete process.env.META_CONVERSIONS_TOKEN;
    });

    await check("a lapsed Meta connection: page views only, nothing reported", async () => {
      await db.metaAdAccount.update({ where: { organizationId: ORG }, data: { status: "TOKEN_EXPIRED" } });
      forgetSiteTarget();
      assert.deepEqual(await siteTarget(), { pixelId: "4242424242", token: null, source: "aios" });
      assert.equal(await siteConversionsOn(), false);
    });

    await check("turned off: off again", async () => {
      await db.siteSetting.delete({ where: { key: SITE_PIXEL_SETTING } });
      forgetSiteTarget();
      assert.equal(await siteTarget(), null);
    });

    console.log(`\n${passed} checks passed. (Meta stubbed.)`);
  } finally {
    await cleanup();
    await db.$disconnect();
  }
}

main().catch(async (error) => {
  console.error(error);
  await cleanup().catch(() => undefined);
  process.exit(1);
});
