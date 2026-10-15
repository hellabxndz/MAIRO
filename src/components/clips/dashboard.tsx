"use client";

import type { ReactNode } from "react";
import { BusinessArt } from "@/components/hero-story/art";
import { DemoFrame } from "@/components/console/demo";
import { ConsoleHeader } from "@/components/console/header";
import { MetricStrip } from "@/components/console/metrics";
import { ResultsPanel } from "@/components/console/results";
import { CampaignsPanel } from "@/components/console/campaigns";
import { CreativesPanel, type CreativeTileData } from "@/components/console/creatives";
import { ActionCenter, ActionCard } from "@/components/console/action-center";
import { TeamPanel } from "@/components/console/team";
import { Panel, primaryAction, quietAction } from "@/components/console/kit";
import { Journey } from "@/components/results/results-figures";
import type { JourneyStage } from "@/lib/results/model";
import type { ClipLayout } from "@/lib/demo/clip";
import { SHOP, SHOP_CONSOLE as S, shopDaily } from "@/lib/demo/shop-sample";
import type { Clip } from "./stage";

// "Every result. One clear dashboard." — the sample shop's MAIRO, page by
// page, as the sidebar orders it: Overview, Campaigns, Creative Studio,
// Performance, AI Team, Recommendations, Approvals and Results. Every figure
// is a sample figure and says where it would come from.

const art = (v: "demo" | "problem" | "offer") => <BusinessArt type="shop" variant={v} className="h-full w-full" />;

export const SHOP_CREATIVES: CreativeTileData[] = [
  { key: "r1", headline: "Made by hand. Yours every morning.", caption: "Handmade mugs — sales", kind: "live", imageUrl: null, art: art("demo"), label: "The product in use" },
  { key: "r2", headline: "Free shipping over $60.", caption: "Picture made · waiting for you", kind: "review", imageUrl: null, art: art("offer"), label: "The offer" },
  { key: "r3", headline: "Mugs that don't chip in a month.", caption: "Short video idea · you film it", kind: "suggested", imageUrl: null, label: "Built to last" },
  { key: "r4", headline: "The mug for slow mornings.", caption: "Your edit", kind: "draft", imageUrl: null, label: "Who it's for" },
];

export const SHOP_JOURNEY: JourneyStage[] = [
  { key: "reach", label: "People reached", value: "14,820", source: "Meta", rate: null, missing: null },
  { key: "clicks", label: "Visits to your shop", value: "386", source: "Meta", rate: null, missing: null },
  { key: "purchases", label: "Purchases", value: "12", source: "Meta", rate: null, missing: null },
  { key: "orders", label: "Matched orders", value: "11", source: "Your store", rate: "11 of 12", missing: null },
  { key: "value", label: "Order value", value: "$538", source: "Your store", rate: null, missing: null },
];

type Page = { href: string; label: string; at: number };
export const DASH_PAGES: Page[] = [
  { href: "/dashboard", label: "Overview", at: 0 },
  { href: "/dashboard/campaigns", label: "Campaigns", at: 3200 },
  { href: "/dashboard/creatives", label: "Creative Studio", at: 6000 },
  { href: "/dashboard/analytics", label: "Performance", at: 8800 },
  { href: "/dashboard/team", label: "AI Team", at: 11600 },
  { href: "/dashboard/coach", label: "Recommendations", at: 14400 },
  { href: "/dashboard/decisions", label: "Approvals", at: 17200 },
  { href: "/dashboard/reports", label: "Results", at: 20000 },
];
const END = 23500;

const pageAt = (t: number) => {
  let p = DASH_PAGES[0];
  for (const q of DASH_PAGES) if (t >= q.at + 150) p = q;
  return p;
};

function Title({ title, sub }: { title: string; sub: string }) {
  return (
    <div>
      <p className="text-[24px] font-semibold tracking-[-0.02em] text-white">{title}</p>
      <p className="mt-1 text-[13.5px] text-muted">{sub}</p>
    </div>
  );
}

export function DashboardPage({ href }: { href: string }) {
  const points = shopDaily();
  const results = <ResultsPanel points={points} count={{ key: "purchases", label: "Purchases" }} empty={null} insights={S.insights} period="last 14 days" />;
  const pages: Record<string, ReactNode> = {
    "/dashboard": (
      <div className="space-y-4">
        <ConsoleHeader data={S.header} />
        <p className="text-[22px] font-semibold tracking-[-0.02em] text-white">Your business at a glance.</p>
        <MetricStrip metrics={S.metrics} period={S.period} />
        {results}
      </div>
    ),
    "/dashboard/campaigns": (
      <div className="space-y-4">
        <Title title="Campaigns" sub="Every campaign, with the status Meta reports." />
        <CampaignsPanel counts={S.counts} rows={S.campaigns} emptyText="" />
      </div>
    ),
    "/dashboard/creatives": (
      <div className="space-y-4">
        <Title title="Creative Studio" sub="Your ads, from MAIRO's suggestion to running." />
        <CreativesPanel items={SHOP_CREATIVES} emptyText="" note="A suggestion without a picture is a concept: its words and a direction for the picture." />
      </div>
    ),
    "/dashboard/analytics": (
      <div className="space-y-4">
        <Title title="Performance" sub="Money spent and purchases, day by day — as Meta reports them." />
        <MetricStrip metrics={S.metrics} period={S.period} />
        {results}
      </div>
    ),
    "/dashboard/team": (
      <div className="space-y-4">
        <Title title="AI Team" sub="Eight AI specialties of one system, and what each has really done." />
        <TeamPanel members={S.team} intro={S.teamIntro} />
      </div>
    ),
    "/dashboard/coach": (
      <div className="space-y-4">
        <Title title="Recommendations" sub="What your AI team found in your results, and what it proposes." />
        <ActionCenter items={S.actions} total={S.actions.length} emptyText="" />
      </div>
    ),
    "/dashboard/decisions": (
      <div className="space-y-4">
        <Title title="Approvals" sub="Nothing changes in your ad account until you approve it." />
        <Panel id="demo-launch" title="Launch review" tone="lit">
          <div className="grid grid-cols-[96px_minmax(0,1fr)] gap-4 @xl:grid-cols-[140px_minmax(0,1fr)] @xl:gap-5">
            <div className="aspect-[4/5] overflow-hidden rounded-2xl border" style={{ borderColor: "var(--mairo-line)" }}>
              {art("offer")}
            </div>
            <div>
              <p className="text-[17px] font-semibold text-white">Gift sets — retargeting</p>
              <dl className="mt-3 grid grid-cols-2 gap-3 text-[13px]">
                <div>
                  <dt className="text-faint">Daily budget</dt>
                  <dd className="font-medium text-white">$7 a day</dd>
                </div>
                <div>
                  <dt className="text-faint">Where</dt>
                  <dd className="font-medium text-white">Facebook + Instagram</dd>
                </div>
                <div>
                  <dt className="text-faint">Who sees it</dt>
                  <dd className="font-medium text-white">People who visited your shop in the last 30 days</dd>
                </div>
                <div>
                  <dt className="text-faint">People go to</dt>
                  <dd className="font-medium text-white">{SHOP.site}/gifts</dd>
                </div>
              </dl>
              <div className="mt-4 flex flex-wrap gap-2">
                <span className={primaryAction}>Approve launch · $7/day</span>
                <span className={quietAction}>Change something</span>
              </div>
            </div>
          </div>
        </Panel>
        <ActionCard item={S.actions[0]} />
      </div>
    ),
    "/dashboard/reports": (
      <div className="space-y-4">
        <Title title="Results" sub="From people reached to the orders your store confirms — last 14 days." />
        <Panel id="journey" title="From ad to order">
          <Journey stages={SHOP_JOURNEY} />
        </Panel>
        <Panel id="summary" title="Your weekly summary">
          <ul className="space-y-1.5 text-[13.5px] leading-relaxed text-white/80">
            {S.insights.map((i) => (
              <li key={i.key}>{i.text}</li>
            ))}
          </ul>
        </Panel>
      </div>
    ),
  };
  return <>{pages[href]}</>;
}

function Dashboard({ t, narrow }: { t: number; narrow: boolean }) {
  const page = pageAt(t);
  return (
    <DemoFrame view="overview" active={page.href} owner={SHOP.owner} sampleLabel={false} label={`Product demo: the MAIRO ${page.label} page for a fictional shop`}>
      {narrow && (
        <div data-nav className="-mt-2 mb-4 flex flex-wrap gap-1.5">
          {DASH_PAGES.map((p) => (
            <span key={p.href} className={`rounded-full border px-2.5 py-1 text-[11px] ${p.href === page.href ? "border-[#6c9eff]/60 bg-[#2f6bff]/15 text-white" : "border-white/10 text-muted"}`}>
              {p.label}
            </span>
          ))}
        </div>
      )}
      <DashboardPage href={page.href} />
    </DemoFrame>
  );
}

export const DASHBOARD_CLIP: Clip = {
  id: "dashboard",
  title: "Moving through the MAIRO dashboard of a fictional shop",
  duration: END,
  posterAt: 1600,
  captions: [
    { start: 0, end: 3200, text: "Your business at a glance: what you spent, and what came back." },
    { start: 3200, end: 6000, text: "Every campaign, with the status Meta reports." },
    { start: 6000, end: 8800, text: "Your ads, from AI recommendation to running." },
    { start: 8800, end: 11600, text: "Performance over time — and where every figure comes from." },
    { start: 11600, end: 14400, text: "Your AI team, and what each specialty has really done." },
    { start: 14400, end: 17200, text: "Recommendations, each with its reason." },
    { start: 17200, end: 20000, text: "Approvals: nothing changes in your ad account until you say so." },
    { start: 20000, end: END, text: "And your results, from Meta's figures to your store's orders. Sample data throughout." },
  ],
  scenes: [
    {
      id: "dashboard",
      label: "Dashboard",
      start: 0,
      end: END,
      world: (t: number, layout: ClipLayout) => <Dashboard t={t} narrow={layout === "narrow"} />,
      layoutKey: (t) => pageAt(t).href,
      cursor: DASH_PAGES.slice(1).map((p) => ({ at: p.at, cue: `[data-nav] >> text:${p.label}`, click: true })),
      camera: [
        { at: 0, zoom: 1, narrowZoom: 1, dur: 1 },
        { at: 1200, cue: '[data-panel="results-panel"]', zoom: 1, narrowZoom: 1, align: "center", dur: 1200 },
        { at: 3200, zoom: 1, narrowZoom: 1, dur: 1 },
        { at: 9700, cue: '[data-panel="results-panel"]', zoom: 1, narrowZoom: 1, align: "center", dur: 1200 },
        { at: 11600, zoom: 1, narrowZoom: 1, dur: 1 },
        { at: 21000, cue: '[data-panel="summary"]', zoom: 1, narrowZoom: 1, align: "center", dur: 1200 },
      ],
    },
  ],
};
