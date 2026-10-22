// Checks the help center says what the product does:
//
//   - Every article is complete: a known topic, related articles that exist,
//     and links to pages that exist.
//   - Its numbers are the enforced ones — prices, trial, limits and credits
//     from the plans and entitlements, the credit hold from the ledger.
//   - Partial capabilities carry their stated limits; nothing unavailable is
//     described as available; no banned claims.
//   - Search finds the right article for the usual questions.
//   - The screens that link to help point at articles that exist, and the old
//     guide's out-of-date wording is gone.
//
//   npm run check:help   (pure; no database, no network)

import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { HELP_CATEGORIES, articleText, helpArticles, helpIndex, searchHelp } from "../src/lib/help/articles";
import { PLANS, PRO_TRIAL_DAYS } from "../src/lib/plans";
import { DEFAULT_ENTITLEMENTS } from "../src/lib/entitlements";
import { BANNED_CLAIMS, capability } from "../src/lib/capabilities";
import { RESERVATION_TIMEOUT_MS } from "../src/lib/creative-studio/credits";
import { MONEY_AND_CONTROL, alwaysYours } from "../src/lib/pricing/compare";

const root = join(import.meta.dirname, "..");
const read = (p: string) => readFileSync(join(root, p), "utf8");
let passed = 0;
function check(name: string, fn: () => void) {
  fn();
  passed++;
  console.log(`  ok  ${name}`);
}

const articles = helpArticles();
const bySlug = new Map(articles.map((a) => [a.slug, a]));
const text = (slug: string) => articleText(bySlug.get(slug)!);

// Every page.tsx as a route, for link checks.
const pages: string[] = [];
const walk = (dir: string) => {
  for (const f of readdirSync(join(root, dir))) {
    const p = join(dir, f);
    if (statSync(join(root, p)).isDirectory()) walk(p);
    else if (f === "page.tsx") pages.push("/" + dir.replace(/^src\/app\/?/, "").split("/").filter((s) => s && !/^\(.*\)$/.test(s)).join("/"));
  }
};
walk("src/app");
const routeExists = (href: string) => {
  const path = href.split(/[?#]/)[0] || "/";
  const want = (path.replace(/\/$/, "") || "/").split("/");
  return pages.some((page) => {
    const have = page.split("/");
    return have.length === want.length && have.every((seg, i) => seg === want[i] || /^\[.+\]$/.test(seg));
  });
};

console.log("— the articles —");
check("eight articles, each with a unique slug and a known topic", () => {
  assert.deepEqual(articles.map((a) => a.slug), ["getting-started", "connect-meta", "website-tracking", "failed-generation", "credits-and-usage", "approvals", "results", "billing"]);
  for (const a of articles) {
    assert.ok(HELP_CATEGORIES.includes(a.category), a.slug);
    assert.ok(a.title && a.summary && a.blocks.length >= 3, a.slug);
  }
});
check("related articles exist, and every link goes to a real page", () => {
  const bad: string[] = [];
  for (const a of articles) {
    for (const r of a.related) if (!bySlug.has(r) || r === a.slug) bad.push(`${a.slug} → related ${r}`);
    for (const l of a.links) if (!routeExists(l.href)) bad.push(`${a.slug} → ${l.href}`);
    for (const l of a.links) if (l.href.startsWith("/dashboard") !== Boolean(l.app)) bad.push(`${a.slug} → ${l.href} app flag`);
  }
  assert.deepEqual(bad, []);
});
check("the public and in-app help routes exist", () => {
  for (const r of ["/help", "/help/billing", "/dashboard/guide", "/dashboard/guide/billing"]) assert.ok(routeExists(r), r);
});

console.log("\n— the numbers are the enforced ones —");
check("prices, trial, campaign limits, credits and creative requests match the plans and entitlements", () => {
  const credits = bySlug.get("credits-and-usage")!;
  const table = credits.blocks.find((b) => b.kind === "table");
  assert.ok(table && table.kind === "table");
  const row = (label: string) => table.rows.find((r) => r[0] === label)!.slice(1);
  const tiers = ["PRO", "SCALE_V2"] as const;
  assert.deepEqual(table.head.slice(1), tiers.map((t) => PLANS.find((p) => p.tier === t)!.name));
  assert.deepEqual(row("Price"), tiers.map((t) => `$${PLANS.find((p) => p.tier === t)!.priceMonthly} a month`));
  assert.deepEqual(row("Free trial"), [`${PRO_TRIAL_DAYS} days`, "None"]);
  assert.deepEqual(row("Meta ad accounts"), tiers.map((t) => String(DEFAULT_ENTITLEMENTS[t].ad_account_limit)));
  assert.deepEqual(row("Campaigns at once"), tiers.map((t) => (Number.isFinite(DEFAULT_ENTITLEMENTS[t].campaign_limit) ? String(DEFAULT_ENTITLEMENTS[t].campaign_limit) : "Unlimited")));
  for (const [i, t] of tiers.entries()) {
    assert.match(row("AI image credits")[i], new RegExp(`^${DEFAULT_ENTITLEMENTS[t].studio_credits_monthly} a month`));
    assert.equal(row("Creative requests")[i], `${DEFAULT_ENTITLEMENTS[t].creative_limit} a month`);
  }
  assert.match(text("billing"), /MAIRO Pro is \$139.99 a month, MAIRO Scale is \$299.99 a month/);
  assert.match(text("billing"), /keep its price and features until you choose to switch/);
  assert.match(text("billing"), /7-day free trial/);
});
check("a failed picture costs nothing, and the hold's timeout is the ledger's own", () => {
  const t = text("failed-generation");
  assert.match(t, /a failed picture costs nothing/);
  assert.match(t, new RegExp(`come back within ${Math.round(RESERVATION_TIMEOUT_MS / 60_000)} minutes`));
  assert.match(t, /never shows a placeholder as if it were your picture/);
  assert.match(t, /doesn't make videos from scratch with AI/);
});
check("money, approvals and cancelling are told with the pricing page's own words", () => {
  for (const key of ["approvals", "pause"]) assert.ok(text("approvals").includes(MONEY_AND_CONTROL.find((m) => m.key === key)!.body), key);
  for (const key of ["who-pays", "ending"]) assert.ok(text("billing").includes(MONEY_AND_CONTROL.find((m) => m.key === key)!.body), key);
  assert.ok(text("connect-meta").includes(MONEY_AND_CONTROL.find((m) => m.key === "disconnect")!.body));
  for (const a of alwaysYours()) assert.ok(text("approvals").includes(a.label), a.label);
});

console.log("\n— honest about limits —");
check("partial capabilities carry their stated limits", () => {
  assert.ok(text("getting-started").includes(capability("website-reading").publicNote!));
  assert.ok(text("website-tracking").includes(capability("pixel").publicNote!));
  assert.ok(text("website-tracking").includes(capability("pixel-gtm").publicNote!));
  assert.ok(text("approvals").includes(capability("automation-levels").publicNote!));
});
check("nothing unavailable is described as available, and no banned claims", () => {
  const all = articles.map(articleText).join(" ");
  assert.doesNotMatch(all, /TikTok|Google Ads/);
  assert.equal(capability("ai-video").status, "unavailable");
  assert.doesNotMatch(all, /AI[- ]generated video|generates? (a )?videos?/i);
  for (const b of BANNED_CLAIMS) assert.doesNotMatch(all, b.pattern, b.why);
  assert.doesNotMatch(all, /\bwill (increase|grow|double|boost)\b|\bguaranteed?\b/i);
});
check("a campaign is live only once Meta confirms it", () => {
  assert.match(text("getting-started"), /shows a campaign as live only once Meta confirms it/);
  assert.match(text("getting-started"), /Nothing launches and nothing is spent until you do/);
});

console.log("\n— search —");
check("the usual questions find the right article first", () => {
  const first = (q: string) => searchHelp(q, helpIndex())[0]?.slug;
  const cases: [string, string][] = [
    ["credits", "credits-and-usage"],
    ["cancel", "billing"],
    ["pixel", "website-tracking"],
    ["approvals", "approvals"],
    ["picture failed", "failed-generation"],
    ["disconnect facebook", "connect-meta"],
    ["empty numbers", "results"],
    ["get started", "getting-started"],
  ];
  for (const [q, want] of cases) assert.equal(first(q), want, q);
  assert.equal(searchHelp("zzzz", helpIndex()).length, 0);
  assert.equal(searchHelp("", helpIndex()).length, articles.length);
});

console.log("\n— linked from the product —");
check("every screen's help link points at an article that exists", () => {
  const files = ["src/app/dashboard/billing/page.tsx", "src/app/dashboard/creative-studio/page.tsx", "src/app/dashboard/tracking/page.tsx", "src/app/dashboard/decisions/page.tsx", "src/app/dashboard/analytics/page.tsx", "src/app/dashboard/meta/page.tsx"];
  for (const f of files) {
    const src = read(f);
    const slugs = [...src.matchAll(/<HelpLinks[^>]*links=\{\[([^\]]*)\]\}/g)].flatMap((m) => [...m[1].matchAll(/slug: "([^"]+)"/g)].map((x) => x[1]));
    assert.ok(slugs.length > 0, f);
    for (const s of slugs) assert.ok(bySlug.has(s), `${f}: ${s}`);
  }
  assert.match(read("src/app/dashboard/layout.tsx"), /href="\/dashboard\/guide"/);
  assert.match(read("src/components/landing/site-footer.tsx"), /\["Help center", "\/help"\]/);
});
check("the old guide's out-of-date wording is gone", () => {
  const guide = read("src/app/dashboard/guide/page.tsx");
  assert.doesNotMatch(guide, /Meta Ads Manager when you are ready|Strategist|no panel of specialists/);
  assert.match(guide, /helpIndex\(\)/);
  assert.ok(existsSync(join(root, "src/app/dashboard/guide/[slug]/page.tsx")));
});

console.log(`\nHelp: ${passed} checks passed`);
