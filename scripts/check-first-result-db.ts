// Checks the first-result notice: said once, only from a real figure, with
// where it came from.
//
//   - nothing to say → no notice (an empty account isn't a result);
//   - leads typed in or imported, and spam, don't count as a first result;
//   - the first enquiry from an ad is said once, as MAIRO's count, naming the
//     campaign; later leads and later runs add nothing;
//   - with no ad lead, a purchase or booking Meta reports is said as Meta's figure;
//   - one business's leads never reach another's notice.
//
//   npm run check:first-result-db   (needs DATABASE_URL; no network)

import assert from "node:assert/strict";
import { db } from "../src/lib/db";
import { detectFirstResult } from "../src/lib/notifications/detect";

let passed = 0;
async function check(name: string, fn: () => Promise<void> | void) {
  await fn();
  passed++;
  console.log(`  ok  ${name}`);
}

const TAG = "zz-firstresult";
const A = `${TAG}-a`;
const B = `${TAG}-b`;
const C = `${TAG}-c`;
const report = (m: { purchases?: number | null; bookings?: number | null } = {}) => ({ total: { purchases: m.purchases ?? null, bookings: m.bookings ?? null } }) as never;
const run = async (org: string, m?: { purchases?: number | null; bookings?: number | null }) => {
  const r = { found: 0, created: 0 };
  await detectFirstResult(org, report(m), r);
  return r;
};
const notices = (org: string) => db.notification.findMany({ where: { organizationId: org, dedupeKey: "first-result" }, select: { title: true, body: true, actionHref: true, mairoCampaignId: true } });
const lead = (organizationId: string, source: "MAIRO_FORM" | "META_INSTANT" | "MANUAL" | "CSV_IMPORT", extra: Record<string, unknown> = {}) =>
  db.lead.create({ data: { organizationId, source, answersJson: "{}", ...extra } });

async function cleanup() {
  await db.organization.deleteMany({ where: { id: { startsWith: TAG } } });
}

async function main() {
  await cleanup();
  try {
    for (const id of [A, B, C]) await db.organization.create({ data: { id, name: id } });
    const campaign = await db.mairoCampaign.create({ data: { organizationId: A, name: "Spring leads", objective: "LEADS", status: "ACTIVE", totalDailyBudgetCents: 2000 } });

    await check("nothing yet: no notice", async () => {
      assert.deepEqual(await run(A), { found: 0, created: 0 });
      assert.equal((await notices(A)).length, 0);
    });
    await check("leads you added yourself, and spam, aren't a first result", async () => {
      await lead(A, "MANUAL");
      await lead(A, "CSV_IMPORT");
      await lead(A, "MAIRO_FORM", { status: "SPAM" });
      assert.deepEqual(await run(A), { found: 0, created: 0 });
    });
    await check("the first enquiry from an ad is said once, as MAIRO's count, naming the campaign", async () => {
      await lead(A, "MAIRO_FORM", { mairoCampaignId: campaign.id, createdAt: new Date("2026-10-12T15:00:00Z") });
      assert.deepEqual(await run(A), { found: 1, created: 1 });
      const [n] = await notices(A);
      assert.equal(n.title, "Your first enquiry from your ads");
      assert.match(n.body, /on October 12 from “Spring leads”\. MAIRO counted it from your form\./);
      assert.equal(n.actionHref, "/dashboard/leads");
      assert.equal(n.mairoCampaignId, campaign.id);
    });
    await check("later leads and later runs add nothing", async () => {
      await lead(A, "META_INSTANT");
      assert.deepEqual(await run(A, { purchases: 3 }), { found: 1, created: 0 });
      assert.equal((await notices(A)).length, 1);
    });
    await check("with no ad lead, Meta's reported purchase is said as Meta's figure", async () => {
      assert.deepEqual(await run(B, { purchases: 2 }), { found: 1, created: 1 });
      const [n] = await notices(B);
      assert.equal(n.title, "Meta reports your first purchase");
      assert.match(n.body, /Meta has reported 2 purchases from your ads\. That's Meta's figure; orders your store confirms are counted separately\./);
    });
    await check("a booking Meta reports, likewise; zero is not a result", async () => {
      assert.deepEqual(await run(C, { purchases: 0, bookings: 0 }), { found: 0, created: 0 });
      assert.deepEqual(await run(C, { bookings: 1 }), { found: 1, created: 1 });
      assert.equal((await notices(C))[0].title, "Meta reports your first booking");
    });
    await check("one business's leads never reach another's notice", async () => {
      assert.ok(!(await notices(B))[0].body.includes("Spring leads"));
      assert.equal(await db.notification.count({ where: { organizationId: B, mairoCampaignId: campaign.id } }), 0);
    });
  } finally {
    await cleanup();
    await db.$disconnect();
  }
  console.log(`\nFirst result: ${passed} checks passed`);
}

main().catch(async (e) => {
  console.error(e);
  await cleanup().catch(() => undefined);
  process.exit(1);
});
