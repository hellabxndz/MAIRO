"use client";

import { DemoFrame } from "@/components/console/demo";
import { Panel, Pill } from "@/components/console/kit";
import { ResultsPanel } from "@/components/console/results";
import { MairoDecisionCard } from "@/components/decisions/decision-card";
import { ALWAYS_NEEDS_APPROVAL, LEVELS, actionInfo } from "@/lib/automation/levels";
import type { ClipLayout } from "@/lib/demo/clip";
import { SHOP, SHOP_DECISION, shopDaily } from "@/lib/demo/shop-sample";
import type { Clip } from "./stage";

// "Smarter decisions, backed by your results." — the sample shop's results
// over two weeks, where one ad stands out, then the recommendation the
// Approval Center shows for it: what was noticed, the proposed change, the
// reason, the evidence, the effect on the budget, the risk and who has to
// authorise it — and the owner approving it. Then what MAIRO may do on its
// own (only at the level the owner chose) and what always waits, from the
// product's own automation rules.

const BY_AD = [
  { ad: "“Made by hand. Yours every morning.”", spend: "$214.30", purchases: 9 },
  { ad: "“Mugs that don't chip in a month.”", spend: "$121.50", purchases: 2 },
  { ad: "“Free shipping over $60.”", spend: "$76.60", purchases: 1 },
];

export const OPTIMIZE_T = { decision: 5600, approve: 14200, rules: 17000, end: 21700 } as const;
const T = OPTIMIZE_T;

function Results() {
  return (
    <DemoFrame view="results" active="/dashboard/analytics" owner={SHOP.owner} sampleLabel={false} label="Product demo: performance for a fictional shop">
      <div className="space-y-4">
        <ResultsPanel points={shopDaily()} count={{ key: "purchases", label: "Purchases" }} empty={null} insights={[]} period="last 14 days" />
        <Panel id="by-ad" title="Purchases by ad · as Meta reports them">
          <ul className="divide-y divide-white/[0.06]">
            {BY_AD.map((r, i) => (
              <li key={r.ad} data-cue={`ad-${i}`} className="flex items-center gap-3 py-2.5 text-[13.5px]">
                <span className="min-w-0 flex-1 truncate text-white">{r.ad}</span>
                <span className="w-20 text-right tabular-nums text-muted">{r.spend}</span>
                <span className={`w-24 text-right tabular-nums ${i === 0 ? "font-semibold text-white" : "text-white/70"}`}>{r.purchases} purchase{r.purchases === 1 ? "" : "s"}</span>
              </li>
            ))}
          </ul>
        </Panel>
      </div>
    </DemoFrame>
  );
}

function Decision({ t, narrow }: { t: number; narrow: boolean }) {
  const approved = t >= T.approve + 150;
  const assisted = LEVELS.find((l) => l.level === "ASSISTED")!;
  return (
    <DemoFrame view="approvals" active="/dashboard/decisions" owner={SHOP.owner} sampleLabel={false} label="Product demo: a recommendation in the Approval Center">
      <div className="space-y-4">
        <div>
          <p className="text-[24px] font-semibold tracking-[-0.02em] text-white">Approvals</p>
          <p className="mt-1 text-[13.5px] text-muted">Nothing changes in your ad account until you approve it.</p>
        </div>
        {approved ? (
          <Panel id="approved" title="Approved" tone="lit">
            <p className="text-[16px] font-medium text-white">{SHOP_DECISION.title}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              <Pill tone="live" dot>
                Approved by you
              </Pill>
              <Pill tone="muted">No change to what you spend</Pill>
            </div>
            <p className="mt-3 text-[13px] leading-relaxed text-white/75">The new version is added to Handmade mugs — sales and shares its budget. MAIRO reads the results daily and tells you which line wins — with the figures — once there are enough purchases to say.</p>
          </Panel>
        ) : (
          <div data-cue="card">
            <MairoDecisionCard decision={SHOP_DECISION} advanced={false} timeZone="America/New_York" />
          </div>
        )}
        {t >= T.rules && (
          <div data-cue="rules" className={`grid gap-4 ${narrow ? "" : "grid-cols-2"}`}>
            <Panel title={`Within your limits · ${assisted.label}`}>
              <p className="-mt-1 text-[12.5px] text-muted">{assisted.summary}</p>
              <ul className="mt-3 space-y-1.5 text-[13px] text-white/85">
                {(["pause-underperformer", "test-new-creative", "shift-budget"] as const).map((a) => (
                  <li key={a}>· {actionInfo(a).label}</li>
                ))}
              </ul>
              <p className="mt-3 text-[11.5px] text-faint">Only if you choose that level. On Manual, every change waits for you.</p>
            </Panel>
            <Panel title="Always waits for you">
              <ul className="space-y-1.5 text-[13px] text-white/85">
                {ALWAYS_NEEDS_APPROVAL.map((a) => (
                  <li key={a}>· {actionInfo(a).label}</li>
                ))}
              </ul>
            </Panel>
          </div>
        )}
      </div>
    </DemoFrame>
  );
}

export const OPTIMIZE_CLIP: Clip = {
  id: "optimize",
  title: "A recommendation from MAIRO, with its evidence, for a fictional shop",
  duration: T.end,
  posterAt: 9000,
  captions: [
    { start: 0, end: T.decision, text: "MAIRO reads your results every day — what Meta reports, and the orders you confirm." },
    { start: T.decision, end: 10000, text: "When something is worth testing, it says what it noticed and why." },
    { start: 10000, end: T.approve, text: "With the evidence, the effect on your budget, and the risk." },
    { start: T.approve, end: T.rules, text: "You decide. Approved — and nothing about your spend changed." },
    { start: T.rules, end: T.end, text: "Small, reversible changes can run on their own only if you allow it. The big ones always wait for you." },
  ],
  scenes: [
    {
      id: "results",
      label: "Results",
      start: 0,
      end: T.decision,
      world: () => <Results />,
      cursor: [{ at: 3200, cue: '[data-cue="ad-0"]' }],
      camera: [
        { at: 0, cue: '[data-panel="results-panel"]', zoom: 1.05, narrowZoom: 1, align: "top", dur: 1 },
        { at: 2400, cue: '[data-panel="by-ad"]', zoom: 1.2, narrowZoom: 1, align: "center" },
      ],
    },
    {
      id: "decision",
      label: "Recommendation",
      start: T.decision,
      end: T.end,
      world: (t: number, layout: ClipLayout) => <Decision t={t} narrow={layout === "narrow"} />,
      layoutKey: (t) => `${t >= T.approve + 150}|${t >= T.rules}`,
      cursor: [
        { at: 8000, cue: "text:Supporting evidence" },
        { at: 11600, cue: "text:Budget impact" },
        { at: T.approve, cue: '[data-cue="card"] >> text:Approve', click: true },
      ],
      camera: [
        { at: T.decision, cue: '[data-cue="card"]', zoom: 1.1, narrowZoom: 1, align: "top", dur: 1 },
        { at: 7600, cue: "text:Supporting evidence", xCue: '[data-cue="card"]', zoom: 1.1, narrowZoom: 1, align: "top" },
        { at: 10600, cue: "text:Budget impact", xCue: '[data-cue="card"]', zoom: 1.1, narrowZoom: 1, align: "center" },
        { at: T.approve + 300, zoom: 1.05, narrowZoom: 1, dur: 800 },
        { at: T.rules + 300, cue: '[data-cue="rules"]', zoom: 1.05, narrowZoom: 1, align: "center" },
      ],
    },
  ],
};

