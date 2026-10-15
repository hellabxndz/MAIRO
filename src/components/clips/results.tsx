"use client";

import { DemoFrame } from "@/components/console/demo";
import { ActionCard } from "@/components/console/action-center";
import { Panel } from "@/components/console/kit";
import { Journey, MetricGrid } from "@/components/results/results-figures";
import type { JourneyStage, Metric } from "@/lib/results/model";
import type { ClipLayout } from "@/lib/demo/clip";
import { EXAMPLES } from "@/lib/demo/examples";
import { SHOP, SHOP_CONSOLE as S } from "@/lib/demo/shop-sample";
import { SHOP_JOURNEY } from "./dashboard";
import type { Clip } from "./stage";

// "Know what's working. Know what comes next." — the Results page for the
// sample shop (what the ads cost, what Meta reports, what the shop's own
// orders confirm, each figure with its source), the weekly summary and the
// next suggestion; then the same page for a sample service business, where
// results follow leads to the jobs the owner marks as booked — and a figure
// nobody has given yet is shown as missing, not guessed.

const METRICS: Metric[] = [
  { key: "spend", label: "Money spent", value: "$412.40", source: "Meta", hint: "What Meta charged your ad account.", missing: null },
  { key: "purchases", label: "Purchases", value: "12", source: "Meta", hint: "Purchases Meta attributes to your ads.", missing: null },
  { key: "cpp", label: "Cost per purchase", value: "$34.37", source: "Meta", hint: "Money spent ÷ purchases.", missing: null },
  { key: "orders", label: "Matched orders", value: "11", source: "Your store", hint: "Orders in your store matched to the ads.", missing: null },
  { key: "value", label: "Order value", value: "$538.00", source: "Your store", hint: "What the matched orders were worth.", missing: null },
  { key: "aov", label: "Average order", value: "$48.91", source: "Your store", hint: "Order value ÷ matched orders.", missing: null },
];

const service = EXAMPLES.service;
const SERVICE_JOURNEY: JourneyStage[] = [
  { key: "leads", label: "Leads", value: "11", source: "Meta", rate: null, missing: null },
  { key: "qualified", label: "Good leads", value: "6", source: "You marked", rate: "6 of 11", missing: null },
  { key: "booked", label: "Booked jobs", value: "2", source: "You marked", rate: "2 of 6", missing: null },
  { key: "customers", label: "Customers", value: "2", source: "You marked", rate: null, missing: null },
  { key: "value", label: "Job value", value: null, source: "You entered", rate: null, missing: { why: "Add what the jobs were worth to see it.", href: null, action: null } },
];

export const RESULTS_T = { summary: 6600, service: 10800, end: 17500 } as const;
const T = RESULTS_T;

function ShopResults({ narrow }: { narrow: boolean }) {
  return (
    <DemoFrame view="results" active="/dashboard/reports" owner={SHOP.owner} sampleLabel={false} label="Product demo: the Results page for a fictional shop">
      <div className="space-y-4">
        <div>
          <p className="text-[24px] font-semibold tracking-[-0.02em] text-white">Results · last 14 days</p>
          <p className="mt-1 text-[13.5px] text-muted">{SHOP.name} — what your ads cost, and what they brought back.</p>
        </div>
        <Panel id="metrics" title="The figures">
          <MetricGrid metrics={METRICS} />
        </Panel>
        <Panel id="journey" title="From ad to order">
          <Journey stages={SHOP_JOURNEY} />
        </Panel>
        <div className={`grid gap-4 ${narrow ? "" : "grid-cols-2"}`}>
          <Panel id="summary" title="Your weekly summary">
            <ul className="space-y-1.5 text-[13.5px] leading-relaxed text-white/80">
              {S.insights.map((i) => (
                <li key={i.key}>{i.text}</li>
              ))}
            </ul>
          </Panel>
          <div data-cue="next">
            <ActionCard item={S.actions[1]} />
          </div>
        </div>
      </div>
    </DemoFrame>
  );
}

function ServiceResults() {
  return (
    <DemoFrame view="results" active="/dashboard/reports" owner="Dana" sampleLabel={false} label="Product demo: the Results page for a fictional service business">
      <div className="space-y-4">
        <div>
          <p className="text-[24px] font-semibold tracking-[-0.02em] text-white">Results · last 14 days</p>
          <p className="mt-1 text-[13.5px] text-muted">{service.name} — a service business, where results are leads and the jobs they become.</p>
        </div>
        <Panel id="service-journey" title="From ad to customer">
          <Journey stages={SERVICE_JOURNEY} />
          <p className="mt-3 text-[12.5px] text-faint">Leads come from Meta. Which were good, booked and became customers is what you mark — MAIRO never guesses it.</p>
        </Panel>
      </div>
    </DemoFrame>
  );
}

export const RESULTS_CLIP: Clip = {
  id: "results",
  title: "The MAIRO Results page for a fictional shop and a fictional service business",
  duration: T.end,
  posterAt: 2500,
  captions: [
    { start: 0, end: 3400, text: "What your ads cost, and what they brought back." },
    { start: 3400, end: T.summary, text: "Every figure says where it came from: Meta, or your own store." },
    { start: T.summary, end: T.service, text: "A weekly summary in plain words — and what MAIRO suggests next." },
    { start: T.service, end: T.end, text: "For a service business, results follow leads to booked jobs — the ones you mark. Sample data throughout." },
  ],
  scenes: [
    {
      id: "shop",
      label: "Results",
      start: 0,
      end: T.service,
      world: (_t: number, layout: ClipLayout) => <ShopResults narrow={layout === "narrow"} />,
      cursor: [
        { at: 4200, cue: '[data-panel="metrics"] >> text:Your store' },
        { at: 8800, cue: '[data-cue="next"]' },
      ],
      camera: [
        { at: 0, cue: '[data-panel="metrics"]', zoom: 1.05, narrowZoom: 1, align: "top", dur: 1 },
        { at: 3200, cue: '[data-panel="journey"]', zoom: 1, narrowZoom: 1, align: "center" },
        { at: T.summary, cue: '[data-panel="summary"]', zoom: 1, narrowZoom: 1, align: "center" },
      ],
    },
    {
      id: "service",
      label: "Leads to jobs",
      start: T.service,
      end: T.end,
      world: () => <ServiceResults />,
      cursor: [{ at: 13600, cue: "text:You marked" }],
      camera: [{ at: T.service, cue: '[data-panel="service-journey"]', zoom: 1, narrowZoom: 1, align: "center", dur: 1 }],
    },
  ],
};
