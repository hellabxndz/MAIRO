// Checks the calls Meta only answers when asked as the Page — reading the
// Page's posts, creating an instant form, downloading its leads — ask with the
// Page's own token, fetched from the person's token, and say so plainly when
// Facebook won't hand one over.
//
// The fake Meta below behaves like the real one: any of those three calls made
// with the person's token is refused with code 210, "A page access token is
// required to request this resource" — the error a customer saw live.
//
//   npm run check:page-token   (database; simulated Meta only)

import assert from "node:assert/strict";
import { db } from "../src/lib/db";
import { withGraphTransport } from "../src/lib/meta/client";
import { encryptSecret } from "../src/lib/crypto/secret-box";
import { listPagePosts } from "../src/lib/meta/sales-sources";
import { pushFormToMeta, syncMetaLeads } from "../src/lib/leads/meta-form";
import { PAGE_TOKEN_REFUSED } from "../src/lib/meta/page-token";

const TAG = `pagetoken-${Date.now()}`;
const ORG = `${TAG}-org`;
const PAGE = "PAGE-1";
const USER_TOKEN = "USER-TOKEN";
const PAGE_TOKEN = "PAGE-TOKEN";

let handOver = true;
const asked: string[] = [];

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const needsPage = () => json({ error: { message: "(#210) A page access token is required to request this resource.", type: "OAuthException", code: 210 } }, 400);

const fakeMeta: typeof fetch = async (input, init) => {
  const url = new URL(String(input));
  const path = url.pathname.replace(/^\/v\d+\.\d+/, "");
  const method = (init?.method ?? "GET").toUpperCase();
  const body = init?.body ? new URLSearchParams(String(init.body)) : null;
  const token = url.searchParams.get("access_token") ?? body?.get("access_token");
  asked.push(`${method} ${path} as ${token}`);
  if (path === `/${PAGE}` && url.searchParams.get("fields") === "access_token") {
    if (token !== USER_TOKEN) return json({ error: { message: "bad token", code: 190 } }, 400);
    return json(handOver ? { id: PAGE, access_token: PAGE_TOKEN } : { id: PAGE });
  }
  if (path === `/${PAGE}/published_posts`) {
    if (token !== PAGE_TOKEN) return needsPage();
    return json({ data: [
      { id: `${PAGE}_1`, message: "Spring sale", full_picture: "https://img.example/1.jpg", permalink_url: "https://facebook.com/1", created_time: "2026-10-01T10:00:00+0000" },
      { id: `${PAGE}_2`, message: "Text only" },
    ] });
  }
  if (path === `/${PAGE}/leadgen_forms` && method === "POST") {
    if (token !== PAGE_TOKEN) return needsPage();
    return json({ id: "FORM-1" });
  }
  if (path === "/FORM-1/leads") {
    if (token !== PAGE_TOKEN) return needsPage();
    return json({ data: [{ id: "L1", created_time: "2026-10-02T10:00:00+0000", field_data: [{ name: "full_name", values: ["Jane Diaz"] }, { name: "email", values: ["jane@example.com"] }] }] });
  }
  return json({ data: [] });
};
const viaMeta = <T,>(fn: () => Promise<T>) => withGraphTransport({ fetch: fakeMeta, record: false }, fn);

let passed = 0;
async function check(name: string, fn: () => Promise<void>) {
  await fn();
  passed++;
  console.log(`  ok  ${name}`);
}

async function main() {
  await db.organization.create({ data: { id: ORG, name: "Page token test" } });
  await db.metaAdAccount.create({ data: { organizationId: ORG, metaAdAccountId: "act_1", pageId: PAGE, pageName: "Test Page", accessToken: encryptSecret(USER_TOKEN) } });
  const form = await db.leadForm.create({
    data: {
      organizationId: ORG,
      slug: `${TAG}-form`,
      name: "Quote request",
      headline: "Get a quote",
      description: "Tell us about the job.",
      thankYou: "We'll be in touch.",
      fieldsJson: JSON.stringify([
        { key: "name", label: "Full name", type: "FULL_NAME", required: true },
        { key: "email", label: "Email", type: "EMAIL", required: true },
      ]),
    },
  });

  try {
    await check("the Page's posts are read with the Page's token, and photoless posts are dropped", async () => {
      asked.length = 0;
      const r = await viaMeta(() => listPagePosts(ORG));
      assert.ok(r.ok, JSON.stringify(r));
      assert.deepEqual(r.data.map((p) => p.id), [`${PAGE}_1`]);
      assert.ok(asked.includes(`GET /${PAGE}/published_posts as ${PAGE_TOKEN}`), asked.join(" | "));
    });

    await check("an instant form is created as the Page", async () => {
      asked.length = 0;
      const r = await viaMeta(() => pushFormToMeta(form.id));
      assert.ok(r.ok, JSON.stringify(r));
      assert.equal(r.metaFormId, "FORM-1");
      assert.ok(asked.includes(`POST /${PAGE}/leadgen_forms as ${PAGE_TOKEN}`), asked.join(" | "));
    });

    await check("its leads are downloaded as the Page and land in the Lead table", async () => {
      const r = await viaMeta(() => syncMetaLeads(form.id));
      assert.ok(r.ok, JSON.stringify(r));
      assert.equal(r.added, 1);
      const lead = await db.lead.findFirst({ where: { leadFormId: form.id } });
      assert.ok(lead, "lead stored");
    });

    await check("when Facebook won't hand over the Page's token, the business is told what to do — no code 210", async () => {
      handOver = false;
      const posts = await viaMeta(() => listPagePosts(ORG));
      assert.ok(!posts.ok);
      assert.equal(posts.error, PAGE_TOKEN_REFUSED);
      await db.leadForm.update({ where: { id: form.id }, data: { metaFormId: null } });
      const pushed = await viaMeta(() => pushFormToMeta(form.id));
      assert.ok(!pushed.ok);
      assert.equal(pushed.error, PAGE_TOKEN_REFUSED);
      assert.doesNotMatch(PAGE_TOKEN_REFUSED, /210|token is required/);
    });
  } finally {
    await db.organization.deleteMany({ where: { id: ORG } });
  }
  console.log(`\nPage token: ${passed} checks passed. Simulated Meta only — nothing was sent to Meta.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
