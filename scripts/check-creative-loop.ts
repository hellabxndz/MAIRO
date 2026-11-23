// Checks the creative loop — which ad is working, the evidence behind it, and
// the next test MAIRO proposes from it:
//
//   - No winner is called on thin data: before Meta's learning period ends,
//     with under five results, or when the lead isn't clear.
//   - When the data is thin, MAIRO says exactly what it still needs.
//   - The evidence names the figures it rests on, from Meta, never estimated.
//   - The next test is proposed only from a clear winner, as a new version of
//     that ad inside the same budget, and always waits for approval.
//   - The Results screen and the rule share one verdict.
//
//   npm run check:creative-loop   (pure; no database, no network)

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { EMPTY_METRICS, type PlatformMetrics } from "@/lib/ad-platforms/types";
import { decide } from "@/lib/decisions/rules";
import { mayAutoApply } from "@/lib/decisions/guardrails";
import { DEFAULT_GUARDRAILS } from "@/lib/decisions/gather";
import { creativeReport, WINNER_MIN_RESULTS } from "@/lib/creative/winner";
import type { AdSnapshot, CampaignSnapshot, DecisionInput } from "@/lib/decisions/types";

let bad = 0;
const ok = (n: string, c: boolean, x = "") => {
  if (!c) {
    bad++;
    console.log(`  FAIL ${n} ${x}`);
  } else console.log(`  ok   ${n}`);
};

const NOW = new Date("2026-11-20T12:00:00Z");
const DAY = 86_400_000;
const m = (p: Partial<PlatformMetrics>): PlatformMetrics => ({ ...EMPTY_METRICS, ...p });

function ad(i: number, p: Partial<AdSnapshot> = {}): AdSnapshot {
  return { label: `Ad ${i + 1}`, campaignAdId: `ad${i}`, kind: "IMAGE", externalAdId: `ext-ad-${i}`, headline: `Headline ${i + 1}`, primaryText: "T", recent: null, prior: null, week: null, ...p };
}
function campaign(p: Partial<CampaignSnapshot> = {}): CampaignSnapshot {
  return {
    mairoCampaignId: "c1",
    name: "Winter coffee",
    objective: "SALES",
    status: "ACTIVE",
    platform: "META",
    platformCampaignId: "pc1",
    externalCampaignId: "ext-c1",
    externalAdGroupId: "ext-g1",
    dailyBudgetCents: 4000,
    liveSince: new Date(NOW.getTime() - 14 * DAY),
    recent: null,
    prior: null,
    week: m({ spendCents: 28000, impressions: 20000, reach: 9000, clicks: 400, purchases: 20, conversions: 20 }),
    ads: [ad(0)],
    audience: { geoKey: null, geoLabel: null, geoRadius: null, ageMin: 18, ageMax: 65, specialAdCategory: null, advantageAudience: false },
    destinationType: "WEBSITE",
    destinationUrl: "https://example.com",
    canPauseAd: true,
    canChangeAudience: true,
    ...p,
  };
}
const input = (campaigns: CampaignSnapshot[]): DecisionInput => ({ now: NOW, campaigns, guardrails: DEFAULT_GUARDRAILS, landing: {} });
const nextTest = (c: CampaignSnapshot) => decide(input([c])).decisions.find((d) => d.kind === "test-from-winner");

// A clear winner: 12 purchases at $10 against 4 at $30.
const winnerAds = [
  ad(0, { week: m({ spendCents: 12000, impressions: 9000, clicks: 200, purchases: 12, conversions: 12 }) }),
  ad(1, { week: m({ spendCents: 12000, impressions: 9000, clicks: 150, purchases: 4, conversions: 4 }) }),
];

console.log("— which ad is working —");
{
  const r = creativeReport(campaign({ ads: winnerAds }), NOW);
  ok("a clear winner is called", r.verdict === "winner", r.verdict);
  ok("the winner is the cheaper ad", r.best?.campaignAdId === "ad0");
  ok("evidence names both ads' figures", /“Headline 1” brought 12 purchases at \$10 each/.test(r.evidence) && /“Headline 2” brought 4 purchases at \$30 each/.test(r.evidence), r.evidence);
  ok("says how much it rests on", r.basis.spendCents === 24000 && r.basis.results === 16);
  ok("nothing still needed", r.needs === null);
}
{
  const r = creativeReport(campaign({ ads: [ad(0, { week: m({ spendCents: 3000, purchases: 3, conversions: 3 }) }), ad(1, { week: m({ spendCents: 3000, purchases: 1, conversions: 1 }) })] }), NOW);
  ok("ahead on 3 results is only 'leading'", r.verdict === "leading", r.verdict);
  ok("and says how many more it needs", new RegExp(`calls a winner at ${WINNER_MIN_RESULTS} purchases — 2 to go`).test(r.needs ?? ""), r.needs ?? "");
}
{
  const r = creativeReport(campaign({ ads: [ad(0, { week: m({ spendCents: 10000, purchases: 10, conversions: 10 }) }), ad(1, { week: m({ spendCents: 11000, purchases: 10, conversions: 10 }) })] }), NOW);
  ok("$10 vs $11 isn't a clear win", r.verdict === "leading" && /not by enough to be sure/.test(r.needs ?? ""), r.needs ?? "");
}
{
  const r = creativeReport(campaign({ ads: [ad(0, { week: m({ spendCents: 6000, purchases: 6, conversions: 6 }) }), ad(1, { week: m({ spendCents: 4000, purchases: 0, conversions: 0 }) })] }), NOW);
  ok("a runner-up that spent twice the winner's cost with nothing loses", r.verdict === "winner" && /spent \$40 without one/.test(r.evidence), r.evidence);
}
{
  const young = campaign({ liveSince: new Date(NOW.getTime() - 1 * DAY), ads: winnerAds });
  const r = creativeReport(young, NOW);
  ok("no winner during Meta's learning period", r.verdict === "too-early" && r.best === null);
  ok("says what it waits for", /at least 3 days of delivery and \$20 spent/.test(r.needs ?? ""), r.needs ?? "");
}
{
  const r = creativeReport(campaign({ ads: [ad(0), ad(1)] }), NOW);
  ok("no figures from Meta: no-data, never zero", r.verdict === "no-data" && !/\$0/.test(r.evidence));
}
{
  const r = creativeReport(campaign({ ads: [ad(0, { week: m({ spendCents: 9000, purchases: 3, conversions: 3 }) })] }), NOW);
  ok("one ad: nothing to compare, says how far to the next test", r.verdict === "only-one" && /2 to go/.test(r.needs ?? ""), r.needs ?? "");
}
{
  const r = creativeReport(campaign({ objective: "LEADS", ads: [ad(0, { week: m({ spendCents: 9000, leads: 9, conversions: 9 }) }), ad(1, { week: m({ spendCents: 9000, leads: 3, conversions: 3 }) })] }), NOW);
  ok("lead campaigns are judged on leads", r.word === "lead" && r.verdict === "winner" && /9 leads at \$10 each/.test(r.evidence), r.evidence);
}

console.log("\n— the next test —");
{
  const d = nextTest(campaign({ ads: winnerAds }));
  ok("a clear winner gets a next-test proposal", Boolean(d));
  ok("built from the winning ad", d?.changes[0].type === "new-ad-variation" && (d.changes[0] as { basedOnCampaignAdId: string }).basedOnCampaignAdId === "ad0");
  ok("inside the same budget", /No change to what you spend/.test(d?.impact ?? ""));
  ok("its evidence is the same sentence the Results screen shows", d?.noticed === creativeReport(campaign({ ads: winnerAds }), NOW).evidence);
  ok("one per campaign per week", d?.dedupeKey.startsWith("next-test:pc1:") ?? false);
  const holds = { requireApprovalNewCreatives: true, requireApprovalAudience: true, requireApprovalPlatformShift: true };
  ok("waits for the owner while new creatives need approval — even on Full Autopilot", d ? !mayAutoApply("AUTOPILOT", d.changes, holds) : false);
  ok("waits for the owner in approval mode, whatever the switches", d ? !mayAutoApply("MANUAL", d.changes, { ...holds, requireApprovalNewCreatives: false }) : false);
}
ok("no proposal on a mere lead", !nextTest(campaign({ ads: [ad(0, { week: m({ spendCents: 3000, purchases: 3, conversions: 3 }) }), ad(1, { week: m({ spendCents: 3000, purchases: 1, conversions: 1 }) })] })));
ok("no proposal while learning", !nextTest(campaign({ liveSince: new Date(NOW.getTime() - 1 * DAY), ads: winnerAds })));
ok("no proposal once the campaign already runs five ads", !nextTest(campaign({ ads: [...winnerAds, ad(2), ad(3), ad(4)] })));
ok("no proposal from an ad MAIRO didn't build", !nextTest(campaign({ ads: [{ ...winnerAds[0], campaignAdId: null }, winnerAds[1]] })));

console.log("\n— one screen, one verdict —");
{
  const screen = readFileSync(join(process.cwd(), "src/components/results/best-ad.tsx"), "utf8");
  ok("the Results screen uses the same verdict as the rule", /creativeReport\(c, input\.now\)/.test(screen) && /from "@\/lib\/creative\/winner"/.test(readFileSync(join(process.cwd(), "src/lib/decisions/rules.ts"), "utf8")));
  ok("the next test is approved from the same screen, with the Approval Center's controls", /<DecisionControls decision=\{toView\(next\)\} \/>/.test(screen));
  ok("decisions shown are this business's only", /where: \{ organizationId, status: \{ in: \["PENDING", "FAILED"\] \}/.test(screen));
  ok("approving a test counts as the funnel's follow-up step", /recordOnce\("next_test_approved"/.test(readFileSync(join(process.cwd(), "src/lib/actions/decision-actions.ts"), "utf8")));
}

if (bad) {
  console.log(`\n${bad} check(s) failed.`);
  process.exit(1);
}
console.log("\nAll creative-loop checks passed.");
