// Checks the email copy of MAIRO's notifications (lib/notifications/notify.ts):
//
//   - only the kinds worth an inbox are emailed (KindInfo.email);
//   - only to the business's owners and admins, never to other roles and
//     never to another business's people;
//   - only when an email provider is configured and the business hasn't
//     turned email off;
//   - once per notification, like the notification itself;
//   - an email that fails never loses the notification.
//
//   npm run check:notify-email   (local database; email is captured, never sent)

import assert from "node:assert/strict";
import { db } from "../src/lib/db";
import { notify } from "../src/lib/notifications/notify";
import { KINDS } from "../src/lib/notifications/kinds";
import { withEmailTransport } from "../src/lib/email/send";

let passed = 0;
async function check(name: string, fn: () => void | Promise<void>) {
  await fn();
  passed++;
  console.log(`  ok  ${name}`);
}

const TAG = "zz-mail";
const A = `${TAG}-a`;
const B = `${TAG}-b`;
const sent: { to: string; subject: string; text: string }[] = [];
let failNext = false;
const capture = async (body: Record<string, unknown>) => {
  if (failNext) {
    failNext = false;
    return { ok: false, status: 500 };
  }
  sent.push({ to: (body.to as string[])[0], subject: String(body.subject), text: String(body.text) });
  return { ok: true, status: 200 };
};

async function cleanup() {
  await db.organization.deleteMany({ where: { id: { startsWith: TAG } } });
  await db.user.deleteMany({ where: { email: { startsWith: TAG } } });
}
async function person(org: string, key: string, role: "OWNER" | "ADMIN" | "VIEWER" | "ANALYST") {
  const u = await db.user.create({ data: { email: `${TAG}-${key}@test.invalid`, name: key, passwordHash: "x", organizationId: org } });
  await db.organizationMember.create({ data: { organizationId: org, userId: u.id, role } });
}

async function main() {
  await cleanup();
  const env = { key: process.env.RESEND_API_KEY, from: process.env.EMAIL_FROM };
  process.env.RESEND_API_KEY = "re_test_not_real";
  process.env.EMAIL_FROM = "MAIRO <hello@test.invalid>";
  await db.organization.create({ data: { id: A, name: "Fernleaf Ceramics" } });
  await db.organization.create({ data: { id: B, name: "Other Business" } });
  await person(A, "owner-a", "OWNER");
  await person(A, "admin-a", "ADMIN");
  await person(A, "viewer-a", "VIEWER");
  await person(A, "analyst-a", "ANALYST");
  await person(B, "owner-b", "OWNER");
  const run = <T,>(fn: () => Promise<T>) => withEmailTransport(capture, fn);

  await check("an act-now notification is emailed to the owners and admins only", async () => {
    sent.length = 0;
    await run(() => notify({ organizationId: A, kind: "TRACKING_PROBLEM", dedupeKey: "t:1", title: "Your Pixel stopped sending events on Nov 15", body: "Meta hasn't received anything from your website since Nov 15.", actionLabel: "See what to fix", actionHref: "/dashboard/pixel" }));
    assert.deepEqual(sent.map((m) => m.to).sort(), [`${TAG}-admin-a@test.invalid`, `${TAG}-owner-a@test.invalid`]);
    assert.equal(sent[0].subject, "MAIRO · Your Pixel stopped sending events on Nov 15");
    assert.match(sent[0].text, /See what to fix: https?:\/\/[^\s]+\/dashboard\/pixel/);
    assert.match(sent[0].text, /You're getting this because you manage Fernleaf Ceramics/);
    assert.ok(!sent.some((m) => m.to.includes("owner-b")), "never another business's people");
  });
  await check("the same notification again sends nothing", async () => {
    sent.length = 0;
    await run(() => notify({ organizationId: A, kind: "TRACKING_PROBLEM", dedupeKey: "t:1", title: "x", body: "y" }));
    assert.equal(sent.length, 0);
  });
  await check("kinds that stay in the app aren't emailed", async () => {
    sent.length = 0;
    for (const kind of ["BUDGET_OPPORTUNITY", "CREATIVE_FATIGUE", "COACH_ALERT"] as const) {
      assert.equal(KINDS[kind].email, false);
      await run(() => notify({ organizationId: A, kind, dedupeKey: `k:${kind}`, title: "x", body: "y" }));
    }
    assert.equal(sent.length, 0);
    for (const kind of ["TRACKING_PROBLEM", "TRACKING_WORKING", "CAMPAIGN_LIVE", "CREATIVES_READY", "MAIRO_ACTED", "WEEKLY_REPORT", "NEEDS_ATTENTION"] as const) assert.equal(KINDS[kind].email, true, kind);
  });
  await check("a business that turned email off gets none; the notification is still written", async () => {
    sent.length = 0;
    await db.organization.update({ where: { id: A }, data: { notifyEmail: false } });
    const r = await run(() => notify({ organizationId: A, kind: "CAMPAIGN_LIVE", dedupeKey: "live:1", title: "Live", body: "Your campaign is live." }));
    assert.equal(r.created, true);
    assert.equal(sent.length, 0);
    await db.organization.update({ where: { id: A }, data: { notifyEmail: true } });
  });
  await check("no email provider configured: nothing sent, nothing breaks", async () => {
    sent.length = 0;
    delete process.env.RESEND_API_KEY;
    const r = await run(() => notify({ organizationId: A, kind: "CAMPAIGN_LIVE", dedupeKey: "live:2", title: "Live", body: "Your campaign is live." }));
    process.env.RESEND_API_KEY = "re_test_not_real";
    assert.equal(r.created, true);
    assert.equal(sent.length, 0);
  });
  await check("an email the provider refuses never loses the notification", async () => {
    failNext = true;
    const r = await run(() => notify({ organizationId: A, kind: "CREATIVES_READY", dedupeKey: "ready:1", title: "New ads ready", body: "Three new ads are ready for your approval." }));
    assert.equal(r.created, true);
    assert.ok(await db.notification.findFirst({ where: { organizationId: A, dedupeKey: "ready:1" } }));
  });

  await check("the provider unreachable (a network error): the notification is kept, nothing throws", async () => {
    const r = await withEmailTransport(async () => {
      throw new Error("ECONNRESET");
    }, () => notify({ organizationId: A, kind: "NEEDS_ATTENTION", dedupeKey: "down:1", title: "x", body: "y" }));
    assert.equal(r.created, true);
  });
  await check("one address refused doesn't stop the others", async () => {
    sent.length = 0;
    failNext = true;
    await run(() => notify({ organizationId: A, kind: "MAIRO_ACTED", dedupeKey: "acted:1", title: "MAIRO paused an ad", body: "It spent $48 with no leads." }));
    assert.equal(sent.length, 1, "the second recipient still got it");
  });
  await check("a business from before teams (no memberships yet) still reaches its owner", async () => {
    sent.length = 0;
    const C = `${TAG}-old`;
    await db.organization.create({ data: { id: C, name: "Old Business" } });
    await db.user.create({ data: { email: `${TAG}-old-owner@test.invalid`, name: "old", passwordHash: "x", organizationId: C } });
    await run(() => notify({ organizationId: C, kind: "TRACKING_PROBLEM", dedupeKey: "t:old", title: "x", body: "y" }));
    assert.deepEqual(sent.map((m) => m.to), [`${TAG}-old-owner@test.invalid`]);
  });
  await check("only EMAIL_FROM missing counts as not configured too", async () => {
    sent.length = 0;
    delete process.env.EMAIL_FROM;
    await run(() => notify({ organizationId: A, kind: "CAMPAIGN_LIVE", dedupeKey: "live:3", title: "Live", body: "y" }));
    process.env.EMAIL_FROM = "MAIRO <hello@test.invalid>";
    assert.equal(sent.length, 0);
  });

  process.env.RESEND_API_KEY = env.key;
  process.env.EMAIL_FROM = env.from;
  if (env.key === undefined) delete process.env.RESEND_API_KEY;
  if (env.from === undefined) delete process.env.EMAIL_FROM;
  await cleanup();
  console.log(`\nNotification email: ${passed} checks passed. Every email was captured; nothing was sent.`);
}

main()
  .catch(async (e) => {
    console.error(e);
    await cleanup().catch(() => undefined);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
