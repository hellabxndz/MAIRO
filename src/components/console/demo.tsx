"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { PRIMARY_NAV, SECONDARY_NAV, NavRowView, SIDEBAR_BACKGROUND } from "@/components/mairo/app-shell";
import { BusinessArt } from "@/components/hero-story/art";
import { SAMPLE, sampleDaily } from "@/lib/demo/console-sample";
import { ConsoleHeader } from "./header";
import { MetricStrip } from "./metrics";
import { ActionCenter, ActionCard } from "./action-center";
import { CampaignsPanel } from "./campaigns";
import { CreativesPanel, type CreativeTileData } from "./creatives";
import { ResultsPanel } from "./results";
import { TeamPanel } from "./team";
import { DemoContext, Panel, Pill, SampleLabel, primaryAction, quietAction } from "./kit";

// The website's product demonstrations: the real MAIRO shell — the same
// sidebar rows, the same top bar, the same console panels the dashboard
// renders — filled with the sample account (lib/demo/console-sample.ts).
// Nothing here is drawn separately for marketing, so when the app changes,
// the demonstrations change with it. Links and buttons are inert, and every
// frame carries the sample-data label.

export type DemoView = "overview" | "creatives" | "approvals" | "results";

const ACTIVE: Record<DemoView, string> = { overview: "/dashboard", creatives: "/dashboard/creatives", approvals: "/dashboard/decisions", results: "/dashboard/analytics" };

/**
 * Renders its children at a design width and scales them to fit — crisp at
 * any size. With `minScale`, a narrow box doesn't shrink the desktop layout
 * to a smudge: the design width narrows instead (never below `minWidth`), and
 * the console panels reflow through their container queries, the way the app
 * itself does on a phone. With `maxHeight` (design pixels) a tall screen is
 * cut there and fades out, the way a window shows the top of a page.
 */
export function ScaledFrame({ width, minScale, minWidth = 400, maxHeight, children, className = "" }: { width: number; minScale?: number; minWidth?: number; maxHeight?: number; children: ReactNode; className?: string }) {
  const outer = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState<{ design: number; scale: number; height: number } | null>(null);
  useEffect(() => {
    const o = outer.current;
    const i = inner.current;
    if (!o || !i) return;
    const measure = () => {
      const w = o.clientWidth;
      const design = minScale ? Math.round(Math.min(width, Math.max(minWidth, w / minScale))) : width;
      const scale = Math.min(1, w / design);
      // The inner box is laid out at `design` before it's measured.
      i.style.width = `${design}px`;
      setBox({ design, scale, height: i.offsetHeight * scale });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(o);
    ro.observe(i);
    return () => ro.disconnect();
  }, [width, minScale, minWidth]);
  const cut = box && maxHeight ? box.height > maxHeight * box.scale : false;
  const fade = "linear-gradient(to bottom, #000 80%, transparent)";
  return (
    <div ref={outer} className={`relative w-full overflow-hidden ${className}`} style={{ height: box ? (cut ? maxHeight! * box.scale : box.height) : undefined, maskImage: cut ? fade : undefined, WebkitMaskImage: cut ? fade : undefined }}>
      {/* Out of flow, so the design width never widens whatever holds the frame. */}
      <div ref={inner} className="absolute left-0 top-0 origin-top-left" style={{ width: box?.design ?? width, transform: box ? `scale(${box.scale})` : undefined, visibility: box ? "visible" : "hidden" }}>
        {children}
      </div>
    </div>
  );
}

/** The app's frame: sidebar and top bar exactly as the signed-in app draws them. */
export function DemoFrame({ view, children, sidebar = true, label, sampleLabel = true, active: activeHref, owner = "Dana", advanced = false }: { view: DemoView; children: ReactNode; sidebar?: boolean; label?: string; /** Off where the surrounding demo already carries the label (the walkthrough). */ sampleLabel?: boolean; /** The sidebar entry lit, when it isn't the view's own — a clip moving through the app. */ active?: string; /** The signed-in owner's first name in the top bar. */ owner?: string; /** Advanced mode lit in the top bar's switch. */ advanced?: boolean }) {
  const active = activeHref ?? ACTIVE[view];
  return (
    // A picture of the product to assistive technology — one label, nothing inside to tab to.
    <div role="img" aria-label={label ?? `Product demo with sample data: the MAIRO ${view === "overview" ? "Overview" : view === "creatives" ? "Creative Studio" : view === "approvals" ? "Approvals screen" : "Performance screen"} for a fictional business, ${SAMPLE.business}.`} className="@container/frame relative overflow-hidden rounded-[22px] border text-left" style={{ borderColor: "rgba(236,236,236,0.16)", background: "#0a0a0a", backgroundImage: "var(--mairo-atmosphere)", boxShadow: "0 0 0 1px rgba(255,255,255,0.12), 0 60px 140px -60px rgba(255,255,255,0.55), 0 40px 80px -40px rgba(0,0,0,0.9)" }}>
      <div className="flex" inert>
        {sidebar && (
          <aside aria-hidden className="hidden w-[220px] shrink-0 flex-col border-r px-3 py-4 @4xl/frame:flex" style={{ borderColor: "var(--mairo-line)", background: SIDEBAR_BACKGROUND }}>
            <span className="mb-4 px-2 text-[14px] font-light tracking-[0.3em] text-white">MAIRO</span>
            <span className="mb-4 flex min-h-[38px] items-center justify-center gap-2 rounded-xl text-[13px] font-medium text-white" style={{ backgroundImage: "var(--mairo-ramp)", boxShadow: "var(--mairo-glow-lift)" }}>
              <span aria-hidden>＋</span> Create
            </span>
            <nav data-nav className="flex flex-col gap-0.5">
              {PRIMARY_NAV.map((i) => (
                <NavRowView key={i.href} item={i} active={i.href === active} />
              ))}
            </nav>
            <div className="mt-auto space-y-0.5 border-t pt-3" style={{ borderColor: "var(--mairo-line)" }}>
              {SECONDARY_NAV.map((i) => (
                <NavRowView key={i.href} item={i} active={false} />
              ))}
            </div>
          </aside>
        )}
        <div className="min-w-0 flex-1">
          <div aria-hidden className="flex items-center justify-end gap-3 px-4 pb-2 pt-12 @2xl/frame:px-7 @2xl/frame:pt-5">
            <span className="rounded-full border border-violet-400/30 bg-violet-500/[0.10] px-3 py-1.5 text-[12px] font-medium text-white">✨ Ask Alex</span>
            <span className="flex rounded-full border p-0.5 text-[11px]" style={{ borderColor: "var(--mairo-line)" }}>
              <span className={`rounded-full px-3 py-1 ${advanced ? "text-faint" : "text-white"}`} style={advanced ? undefined : { backgroundImage: "var(--mairo-ramp)" }}>Simple</span>
              <span className={`rounded-full px-3 py-1 ${advanced ? "text-white" : "text-faint"}`} style={advanced ? { backgroundImage: "var(--mairo-ramp)" } : undefined}>Advanced</span>
            </span>
            <span className="flex items-center gap-2 rounded-full border py-1 pl-1 pr-3 text-[12px] text-white" style={{ borderColor: "var(--mairo-line)" }}>
              <span className="flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-medium" style={{ backgroundImage: "var(--mairo-ramp)" }}>{owner.charAt(0)}</span>
              {owner}
            </span>
          </div>
          <div className="@container px-4 pb-5 @2xl/frame:px-7 @2xl/frame:pb-7">
            <DemoContext.Provider value>{children}</DemoContext.Provider>
          </div>
        </div>
      </div>
      {sampleLabel && (
        <span className="pointer-events-none absolute left-4 top-4 z-10">
          <SampleLabel />
        </span>
      )}
    </div>
  );
}

const ART = (variant: "demo" | "problem" | "offer") => <BusinessArt type="service" variant={variant} className="h-full w-full" />;

export const SAMPLE_CREATIVES: CreativeTileData[] = [
  { key: "a1", headline: "Leak under the sink? We'll find it.", caption: "Running · sample ad", kind: "live", imageUrl: null, art: ART("demo"), label: "The service in action" },
  { key: "a2", headline: "From drip to dry in one visit.", caption: "Suggested · test next", kind: "draft", imageUrl: null, art: ART("problem"), label: "Problem and solution" },
  { key: "a3", headline: "Free estimate on every job.", caption: "Suggested direction", kind: "concept", imageUrl: null, label: "The offer" },
];

/**
 * One screen of the sample account, as the dashboard shows it. `approved` is
 * the walkthrough's moment the owner approves the launch: the button gives way
 * to the approval, and the campaign waits for Meta's review — it isn't shown
 * running until Meta would report it.
 */
export function DemoScreen({ view, approved = false }: { view: DemoView; approved?: boolean }) {
  const points = sampleDaily();
  if (view === "creatives") {
    return (
      <div className="space-y-4">
        <ConsoleTitle title="Creative Studio" sub="Your ads, and the directions MAIRO suggests next." />
        <CreativesPanel items={SAMPLE_CREATIVES} emptyText="" note="A concept has its words and direction but no picture yet." />
        <div className="grid gap-4 @3xl:grid-cols-2">
          <ActionCard item={SAMPLE.actions[1]} />
          <Panel title="Why this order">
            <p className="text-[13px] leading-relaxed text-white/75">Short videos of the work bring the most leads for {SAMPLE.business} so far. The second direction tests a promise — one visit — against it.</p>
          </Panel>
        </div>
      </div>
    );
  }
  if (view === "approvals") {
    return (
      <div className="space-y-4">
        <ConsoleTitle title="Approvals" sub="Nothing changes in your ad account until you approve it." />
        <Panel id="demo-launch" title="Launch review" tone="lit">
          <div className="grid grid-cols-[96px_minmax(0,1fr)] gap-4 @xl:grid-cols-[150px_minmax(0,1fr)] @xl:gap-5">
            <div className="aspect-[4/5] overflow-hidden rounded-2xl border" style={{ borderColor: "var(--mairo-line)" }}>
              {ART("demo")}
            </div>
            <div>
              <p className="text-[17px] font-semibold text-white">Leak &amp; drain repair — leads</p>
              <dl className="mt-3 grid grid-cols-2 gap-3 text-[13px]">
                <div>
                  <dt className="text-faint">Daily budget</dt>
                  <dd className="font-medium text-white">$20 a day</dd>
                </div>
                <div>
                  <dt className="text-faint">Where</dt>
                  <dd className="font-medium text-white">Facebook + Instagram</dd>
                </div>
                <div>
                  <dt className="text-faint">Who sees it</dt>
                  <dd className="font-medium text-white">Homeowners within 15 miles</dd>
                </div>
                <div>
                  <dt className="text-faint">People go to</dt>
                  <dd className="font-medium text-white">A Meta lead form</dd>
                </div>
              </dl>
              {approved ? (
                <div data-cue="approved" className="mt-4 flex flex-wrap items-center gap-2">
                  <Pill tone="live" dot>
                    Approved by you
                  </Pill>
                  <Pill tone="warn">Waiting for Meta&rsquo;s review</Pill>
                </div>
              ) : (
                <div className="mt-4 flex flex-wrap gap-2">
                  <span data-cue="approve" className={primaryAction}>
                    Approve launch · $20/day
                  </span>
                  <span className={quietAction}>Change something</span>
                </div>
              )}
              <p className="mt-2 text-[12px] text-faint">{approved ? "It runs only once Meta approves the ad. You can pause it at any time." : "Meta reviews the ad and checks your ad account can be charged before anything runs."}</p>
            </div>
          </div>
        </Panel>
        <div className="grid gap-4 @3xl:grid-cols-2">
          <ActionCard item={SAMPLE.actions[0]} />
          <ActionCard item={SAMPLE.actions[1]} />
        </div>
      </div>
    );
  }
  if (view === "results") {
    return (
      <div className="space-y-4">
        <ConsoleTitle title="Performance" sub="What Meta reports, and what you confirmed — kept apart." />
        <MetricStrip metrics={SAMPLE.metrics} period={SAMPLE.period} />
        <div className="grid gap-4 @3xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
          <ResultsPanel points={points} empty={null} insights={SAMPLE.insights} period="last 14 days" count={{ key: "leads", label: "Leads" }} />
          <ActionCard item={SAMPLE.actions[0]} />
        </div>
      </div>
    );
  }
  return (
    <div className="space-y-4">
      <ConsoleHeader data={SAMPLE.header} />
      <MetricStrip metrics={SAMPLE.metrics} period={SAMPLE.period} />
      <ActionCenter items={SAMPLE.actions} total={SAMPLE.actions.length} emptyText="" />
      <div className="grid gap-4 @3xl:grid-cols-2">
        <CampaignsPanel counts={SAMPLE.counts} rows={SAMPLE.campaigns} emptyText="" />
        <CreativesPanel items={SAMPLE_CREATIVES} emptyText="" />
      </div>
      <div data-cue="results" className="grid gap-4 @3xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <ResultsPanel points={points} empty={null} insights={SAMPLE.insights.slice(0, 2)} period="last 14 days" count={{ key: "leads", label: "Leads" }} />
        <TeamPanel members={SAMPLE.team.slice(0, 4)} intro={SAMPLE.teamIntro} />
      </div>
    </div>
  );
}

function ConsoleTitle({ title, sub }: { title: string; sub: string }) {
  return (
    <div className="mb-2 flex flex-wrap items-end justify-between gap-2">
      <div>
        <h3 className="text-[28px] font-semibold tracking-[-0.03em] text-white">{title}</h3>
        <p className="mt-1 text-[14px] text-muted">{sub}</p>
      </div>
      <Pill tone="muted">{SAMPLE.business}</Pill>
    </div>
  );
}
