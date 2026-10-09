// Checks that a lead arriving on MAIRO's own form reaches Meta: sent once as
// a "Lead" through the Conversions API, with hashed contact details and the
// click id (never the raw email or phone), skipped honestly with no pixel or
// connection, retried by the nightly backstop after a failure, never sent
// twice, and never for a lead Meta already has (its own instant form).
//
//   npm run check:lead-report   (needs DATABASE_URL; makes no network calls)

import assert from "node:assert/strict";
import { db } from "../src/lib/db";
import { withGraphTransport } from "../src/lib/meta/client";
import { saveMetaConnection } from "../src/lib/meta/connection";
import { submitLead } from "../src/lib/leads/forms";
import { reportLeadToMeta, reportUnsentLeads } from "../src/lib/leads/report";

let passed = 0;
async function check(name: string, fn: () => Promise<void> | void) {
  await fn();
  passed++;
  console.log(`  ok  ${name}`);
}

const TAG = "e2e-leadreport";
const ORG = `${TAG}-org`;
const SLUG = `${TAG}-form`;

type Sent = { method: string; path: string; data: { event_name: string; event_id: string; action_source: string; event_source_url?: string; user_data: Record<string, unknown> }[] };
const sent: Sent[] = [];
let refuse = false;
const fakeMeta: typeof fetch = async (input, init) => {
  const url = new URL(String(input));
  const path = url.pathname.replace(/^\/v[\d.]+/, "");
  const method = (init?.method ?? "GET").toUpperCase();
  sent.push({ method, path, data: JSON.parse(url.searchParams.get("data") ?? "[]") });
  if (refuse) return new Response(JSON.stringify({ error: { message: "Temporary problem", code: 2 } }), { status: 500 });
  return new Response(JSON.stringify({ events_received: 1, messages: [] }), { status: 200 });
};
const viaMeta = <T>(fn: () => Promise<T>) => withGraphTransport({ fetch: fakeMeta, record: false }, fn);

async function newLead(values: Record<string, string>, clickId: string | null = null) {
  const r = await submitLead({ slug: SLUG, values, clickId });
  assert.ok(r.ok && r.leadId, JSON.stringify(r));
  return r.leadId!;
}

async function main() {
  await db.organization.deleteMany({ where: { id: { startsWith: TAG } } });
  await db.organization.create({ data: { id: ORG, name: "Lead Report Co" } });
  await db.leadForm.create({
    data: {
      organizationId: ORG,
      slug: SLUG,
      name: "Quote",
      headline: "Get a quote",
      description: "Tell us about the job.",
      thankYou: "Thanks!",
      fieldsJson: JSON.stringify([
        { key: "name", type: "FULL_NAME", label: "Your name", required: true },
        { key: "email", type: "EMAIL", label: "Email", required: false },
        { key: "phone", type: "PHONE", label: "Phone", required: false },
      ]),
    },
  });

  try {
    await check("without a pixel it's skipped and says why — nothing is sent", async () => {
      sent.length = 0;
      const id = await newLead({ name: "Ann Lee", email: "ann@example.com" });
      assert.equal(await viaMeta(() => reportLeadToMeta(id)), "skipped");
      assert.equal(sent.length, 0);
      const lead = await db.lead.findUniqueOrThrow({ where: { id } });
      assert.equal(lead.metaReportedAt, null);
      assert.match(lead.metaReportError ?? "", /No Meta pixel/);
    });

    await saveMetaConnection({ organizationId: ORG, metaAdAccountId: `act_${TAG}`, pageId: "page1", pageName: "Lead Report Co", accessToken: "EAAB-test-token", tokenExpiresAt: null });
    await db.trackingPixel.create({ data: { organizationId: ORG, platform: "META", externalPixelId: "px-123", name: "Pixel", status: "ACTIVE" } });

    let firstId = "";
    await check("a lead is sent once to the pixel as a Lead, hashed, with the click id", async () => {
      sent.length = 0;
      firstId = await newLead({ name: "Bo Diaz", email: "Bo@Example.com", phone: "+1 (555) 123-4567" }, "AbCdEf123");
      assert.equal(await viaMeta(() => reportLeadToMeta(firstId)), "sent");
      assert.equal(sent.length, 1);
      const call = sent[0];
      assert.equal(call.method, "POST");
      assert.equal(call.path, "/px-123/events");
      const e = call.data[0];
      assert.equal(e.event_name, "Lead");
      assert.equal(e.event_id, `lead_${firstId}`);
      assert.equal(e.action_source, "website");
      assert.match(e.event_source_url ?? "", new RegExp(`/f/${SLUG}$`));
      const raw = JSON.stringify(e);
      assert.ok(!raw.includes("Bo@Example.com") && !raw.toLowerCase().includes("bo@example.com"), "the email went unhashed");
      assert.ok(!raw.includes("555"), "the phone went unhashed");
      assert.match(String((e.user_data.em as string[])[0]), /^[a-f0-9]{64}$/);
      assert.match(String((e.user_data.ph as string[])[0]), /^[a-f0-9]{64}$/);
      assert.match(String(e.user_data.fbc), /^fb\.1\.\d+\.AbCdEf123$/);
      const lead = await db.lead.findUniqueOrThrow({ where: { id: firstId } });
      assert.ok(lead.metaReportedAt);
      assert.equal(lead.metaReportError, null);
    });

    await check("never sent twice", async () => {
      sent.length = 0;
      assert.equal(await viaMeta(() => reportLeadToMeta(firstId)), "skipped");
      assert.equal(sent.length, 0);
    });

    await check("a lead with nothing to match on is sent, with a warning saying so", async () => {
      const id = await newLead({ name: "No Contact" });
      assert.equal(await viaMeta(() => reportLeadToMeta(id)), "sent");
      assert.match((await db.lead.findUniqueOrThrow({ where: { id } })).metaReportError ?? "", /nothing to match/);
    });

    await check("a refused send is recorded, then retried by the nightly backstop", async () => {
      refuse = true;
      const id = await newLead({ name: "Cy Ray", email: "cy@example.com" });
      assert.equal(await viaMeta(() => reportLeadToMeta(id)), "failed");
      const failed = await db.lead.findUniqueOrThrow({ where: { id } });
      assert.equal(failed.metaReportedAt, null);
      assert.match(failed.metaReportError ?? "", /Temporary problem/);
      refuse = false;
      sent.length = 0;
      const r = await viaMeta(() => reportUnsentLeads());
      assert.ok(r.sent >= 2, JSON.stringify(r)); // this one and the first, pixel-less lead
      assert.ok(sent.every((s) => s.path === "/px-123/events"));
      assert.ok((await db.lead.findUniqueOrThrow({ where: { id } })).metaReportedAt);
    });

    await check("a lead older than a week isn't sent (Meta won't take it)", async () => {
      const id = await newLead({ name: "Old Lead", email: "old@example.com" });
      await db.lead.update({ where: { id }, data: { createdAt: new Date(Date.now() - 8 * 86_400_000) } });
      sent.length = 0;
      assert.equal(await viaMeta(() => reportLeadToMeta(id)), "skipped");
      assert.equal(sent.length, 0);
    });

    await check("a lead from Meta's own instant form is never sent back to it", async () => {
      const form = await db.leadForm.findUniqueOrThrow({ where: { slug: SLUG } });
      const native = await db.lead.create({ data: { organizationId: ORG, leadFormId: form.id, source: "META_INSTANT", answersJson: "{}", externalLeadId: `${TAG}-native` } });
      sent.length = 0;
      assert.equal(await viaMeta(() => reportLeadToMeta(native.id)), "skipped");
      assert.equal(sent.length, 0);
    });
  } finally {
    await db.organization.deleteMany({ where: { id: { startsWith: TAG } } });
  }

  console.log(`\nlead reporting: ${passed} checks passed`);
  await db.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await db.organization.deleteMany({ where: { id: { startsWith: TAG } } }).catch(() => undefined);
  await db.$disconnect();
  process.exit(1);
});
