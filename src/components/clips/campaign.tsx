"use client";

import type { ReactNode } from "react";
import { StepGoal } from "@/app/dashboard/create/[service]/step-goal";
import { StepAudience } from "@/app/dashboard/create/[service]/step-audience";
import { StepBudget } from "@/app/dashboard/create/[service]/step-budget";
import { Choice, Question } from "@/app/dashboard/create/[service]/wizard-parts";
import { PlanSummary } from "@/app/dashboard/create/[service]/campaign-wizard";
import { BusinessArt } from "@/components/hero-story/art";
import { AdMock } from "@/components/plan-generator/ad-mock";
import { Panel, Pill } from "@/components/console/kit";
import { WIZARD_STEPS, dollars, plannedSpend, type CampaignPlan } from "@/lib/campaigns/plan";
import { PLANS } from "@/lib/plans";
import { pressedAt, type ClipLayout } from "@/lib/demo/clip";
import { SHOP, SHOP_PLAN, shopCampaign } from "@/lib/demo/shop-sample";
import type { PlanConcept } from "@/lib/preview/plan-concepts";
import type { Clip, ClipScene } from "./stage";

// "From strategy to campaign. Without the complexity." — a subscription, the
// owner's own Meta ad account connected, then the real campaign builder's
// steps (goal, audience, budget), the approved creative, and the launch
// review. Approving doesn't make it live: the campaign waits for Meta's own
// review, and is shown live only once Meta says so.

const noop = () => {};
const GROWTH = PLANS.find((p) => p.name === "Growth")!;
const CONCEPT = { ...(SHOP_PLAN.written!.concepts[0] as PlanConcept), headline: "Made by hand. Yours every morning." };

export const CAMPAIGN_T = {
  connect: 1900,
  goalIn: 3800,
  goal: 5300,
  next1: 6900,
  audienceIn: 8000,
  audience: 9200,
  next2: 10800,
  budgetIn: 11800,
  budget: [13000, 13700] as const,
  next3: 14800,
  adIn: 15800,
  ig: 17400,
  launchIn: 19600,
  agree: 21300,
  launch: 22500,
  launched: 23000,
  end: 26500,
} as const;
const T = CAMPAIGN_T;

const press = (on: boolean) => (on ? { transform: "scale(0.96)", filter: "brightness(1.15)" } : undefined);

function planAt(t: number): CampaignPlan {
  const base = shopCampaign();
  return {
    ...base,
    goal: t >= T.goal + 120 ? "SALES" : null,
    destinationType: t >= T.goal + 120 ? "WEBSITE" : null,
    dailyAmount: t < T.budget[0] ? 20 : t < T.budget[1] ? 3 : 33,
  };
}

/** The builder around a step: the steps on the left, the question, and Continue. */
function Wizard({ step, narrow, next, pressed, children }: { step: (typeof WIZARD_STEPS)[number]["id"]; narrow: boolean; next?: string; pressed?: boolean; children: ReactNode }) {
  const index = WIZARD_STEPS.findIndex((s) => s.id === step);
  return (
    <div className={narrow ? "px-4 pb-10 pt-6" : "grid grid-cols-[190px_minmax(0,1fr)] gap-8 px-8 pb-10 pt-8"}>
      {narrow ? (
        <div className="mb-5">
          <p className="text-[12px] text-muted">
            Step {index + 1} of {WIZARD_STEPS.length} · <span className="text-white">{WIZARD_STEPS[index].label}</span>
          </p>
          <div className="mt-2 flex gap-1.5">
            {WIZARD_STEPS.map((s, i) => (
              <span key={s.id} className="h-0.5 flex-1 rounded-full" style={i <= index ? { backgroundImage: "var(--mairo-ramp)" } : { background: "var(--mairo-line)" }} />
            ))}
          </div>
        </div>
      ) : (
        <nav>
          <p className="mb-3 font-mono text-[10px] uppercase tracking-[0.18em] text-faint">Meta campaign</p>
          <ol className="space-y-1">
            {WIZARD_STEPS.map((s, i) => (
              <li key={s.id} className={`flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] ${i === index ? "bg-white/[0.05] text-white" : i < index ? "text-muted" : "text-faint"}`}>
                <span className="flex h-5 w-5 flex-none items-center justify-center rounded-full border text-[10px]" style={{ borderColor: i === index ? "rgba(238,238,238,0.6)" : "var(--mairo-line)", backgroundImage: i === index ? "var(--mairo-ramp)" : undefined, color: i === index ? "white" : undefined }}>
                  {i < index ? "✓" : i + 1}
                </span>
                {s.label}
              </li>
            ))}
          </ol>
        </nav>
      )}
      <section className="min-w-0">
        {children}
        {next && (
          <div className="mt-8 flex items-center justify-between border-t pt-5" style={{ borderColor: "var(--mairo-line)" }}>
            <span className="text-[13px] text-muted">← Back</span>
            <span data-cue="next" className="inline-flex items-center gap-2 rounded-full px-6 py-3 text-[13px] font-medium text-white" style={{ backgroundImage: "var(--mairo-ramp)", boxShadow: "var(--mairo-glow-key)", ...press(Boolean(pressed)) }}>
              {next} <span aria-hidden>→</span>
            </span>
          </div>
        )}
      </section>
    </div>
  );
}

function Connect({ t, narrow }: { t: number; narrow: boolean }) {
  const connected = t >= T.connect + 400;
  return (
    <div className={narrow ? "space-y-4 px-4 pb-10 pt-8" : "mx-auto max-w-[820px] space-y-4 px-8 pb-10 pt-10"}>
      <Panel id="plan-card" title="Your MAIRO plan" tone="lit">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <p className="text-[22px] font-semibold text-white">
            {GROWTH.name} <span className="text-[15px] font-normal text-muted">· ${GROWTH.priceMonthly} a month</span>
          </p>
          <Pill tone="live" dot>
            Active
          </Pill>
        </div>
        <p className="mt-2 text-[13px] leading-relaxed text-white/70">Your Meta ad spend is separate: Meta charges it to your own ad account. MAIRO never spends from its own.</p>
      </Panel>
      {connected ? (
        <p data-cue="connected" className="rounded-xl border px-4 py-3 text-[13px] text-live" style={{ borderColor: "rgba(34,255,136,0.3)", background: "rgba(34,255,136,0.05)" }}>
          Connected — carry on where you left off. <span className="text-white/60">{SHOP.name} · act_•••• 2290</span>
        </p>
      ) : (
        <div className="rounded-xl border p-5" style={{ borderColor: "rgba(255,221,0,0.3)", background: "rgba(255,221,0,0.05)" }}>
          <p className="text-[14px] text-white">Connect your Facebook &amp; Instagram account to make this campaign</p>
          <p className="mt-1 max-w-xl text-[12.5px] leading-relaxed text-muted">You can plan everything now — it saves as you go — but MAIRO can&rsquo;t create the campaign until the account is connected. Nothing is spent before then.</p>
          <span data-cue="connect" className="mt-3 inline-block rounded-full px-4 py-2 text-[12.5px] font-medium text-white" style={{ backgroundImage: "var(--mairo-ramp)", ...press(pressedAt(t, T.connect)) }}>
            {t >= T.connect + 120 ? "Connecting to Meta…" : "Connect Facebook & Instagram"}
          </span>
        </div>
      )}
    </div>
  );
}

function AdStep({ t, narrow }: { t: number; narrow: boolean }) {
  const ig = t >= T.ig + 120;
  return (
    <Wizard step="ad" narrow={narrow} next="Continue">
      <Question title="How would you like to create your advertisement?">
        <div className={`grid gap-2.5 ${narrow ? "" : "grid-cols-2"}`}>
          <Choice selected onClick={noop} label="Create an Ad With AI" sub="Let MAIRO create a professional advertisement for your business" />
          <Choice selected={false} onClick={noop} label="Upload My Own Advertisement" sub="Pictures or a video you already have — MAIRO suggests the words" />
        </div>
        <div className={`mt-5 grid items-start gap-5 ${narrow ? "" : "grid-cols-[minmax(0,1fr)_300px]"}`}>
          <div className="rounded-xl border p-4" style={{ borderColor: "var(--mairo-line)" }}>
            <p className="text-[12px] text-faint">From your Creative Studio</p>
            <p className="mt-1 text-[15px] font-semibold text-white">{CONCEPT.headline}</p>
            <div className="mt-2">
              <Pill tone="blue" dot>
                Approved
              </Pill>
            </div>
            <p className="mt-3 text-[12.5px] leading-relaxed text-muted">The approved picture and words, exactly as you approved them. Change either and it needs your approval again.</p>
          </div>
          <div data-cue="preview">
            <div className="mb-2 flex gap-1 rounded-xl bg-white/[0.04] p-1 text-[12px]">
              <span className={`flex-1 rounded-lg px-2 py-1.5 text-center ${ig ? "text-muted" : "bg-white/[0.10] text-white"}`}>Facebook Feed</span>
              <span data-cue="ig" className={`flex-1 rounded-lg px-2 py-1.5 text-center ${ig ? "bg-white/[0.10] text-white" : "text-muted"}`} style={press(pressedAt(t, T.ig))}>
                Instagram Feed
              </span>
            </div>
            <AdMock c={CONCEPT} business={SHOP.name} placement={ig ? "instagram" : "facebook"} domain={SHOP.site} image={<BusinessArt type="shop" variant="demo" />} />
          </div>
        </div>
      </Question>
    </Wizard>
  );
}

function Launch({ t, narrow }: { t: number; narrow: boolean }) {
  const agreed = t >= T.agree + 120;
  const done = t >= T.launched;
  const plan = planAt(t);
  const spend = plannedSpend(plan);
  if (done) {
    return (
      <div className={narrow ? "px-4 pb-10 pt-8" : "mx-auto max-w-[860px] px-8 pb-10 pt-10"}>
        <Panel id="launch-status" title="Campaigns" tone="lit">
          <p className="text-[18px] font-semibold text-white">Handmade mugs — sales</p>
          <div data-cue="status" className="mt-3 flex flex-wrap items-center gap-2">
            <Pill tone="live" dot>
              Approved by you
            </Pill>
            <Pill tone="warn">Waiting for Meta&rsquo;s review</Pill>
          </div>
          <p className="mt-3 text-[13px] leading-relaxed text-white/70">Built in your Meta ad account. It runs only once Meta approves the ad — MAIRO shows it as live when Meta says it is. You can pause it at any time.</p>
          <dl className="mt-4 grid grid-cols-2 gap-3 text-[13px]">
            <div>
              <dt className="text-faint">Daily budget</dt>
              <dd className="font-medium text-white">$33 a day</dd>
            </div>
            <div>
              <dt className="text-faint">Where</dt>
              <dd className="font-medium text-white">Facebook + Instagram</dd>
            </div>
          </dl>
        </Panel>
      </div>
    );
  }
  return (
    <Wizard step="launch" narrow={narrow}>
      <Question title="Ready to launch?" sub="Everything MAIRO will build, in one place. Nothing is spent until you agree below.">
        <div data-cue="summary">
          <PlanSummary plan={{ ...plan, adChoice: "attached" }} mode="simple" detailed />
        </div>
        <label data-cue="agree" className="mt-5 flex items-start gap-3 rounded-xl border p-4" style={{ borderColor: agreed ? "rgba(238,238,238,0.5)" : "var(--mairo-line)", background: agreed ? "rgba(214,214,214,0.06)" : "transparent", ...press(pressedAt(t, T.agree)) }}>
          <span className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border text-[10px] ${agreed ? "border-[#eeeeee] bg-[#eeeeee] text-black" : "border-white/40"}`}>{agreed ? "✓" : ""}</span>
          <span className="text-[13px] leading-relaxed text-white/90">{`I agree to spend ${dollars(spend.perDayCents)} a day (about ${dollars(spend.per30DaysCents)} every 30 days) on this campaign until I pause or stop it, charged by Meta to my ad account.`}</span>
        </label>
        <div className="mt-6 flex justify-end">
          <span data-cue="launch" className="inline-flex items-center gap-2 rounded-full px-6 py-3 text-[13px] font-medium text-white" style={{ backgroundImage: "var(--mairo-ramp)", boxShadow: "var(--mairo-glow-key)", opacity: agreed ? 1 : 0.4, ...press(pressedAt(t, T.launch)) }}>
            {t >= T.launch + 120 ? "Building…" : "Launch campaign"} <span aria-hidden>→</span>
          </span>
        </div>
      </Question>
    </Wizard>
  );
}

const nar = (l: ClipLayout) => l === "narrow";

export const CAMPAIGN_SCENES: ClipScene[] = [
  {
    id: "connect",
    label: "Connect Meta",
    start: 0,
    end: T.goalIn,
    world: (t, l) => <Connect t={t} narrow={nar(l)} />,
    layoutKey: (t) => String(t >= T.connect + 400),
    cursor: [{ at: T.connect, cue: '[data-cue="connect"]', click: true }],
    camera: [{ at: 0, zoom: 1.15, narrowZoom: 1, dur: 1 }],
  },
  {
    id: "goal",
    // Laid out a little narrower than other scenes, so the builder keeps its margins in frame.
    worldWidth: { wide: 1140 },
    label: "Your goal",
    start: T.goalIn,
    end: T.audienceIn,
    world: (t, l) => (
      <Wizard step="goal" narrow={nar(l)} next="Continue" pressed={pressedAt(t, T.next1)}>
        <StepGoal plan={planAt(t)} update={noop} recommended="SALES" pixelActive businessPhone={null} mode="simple" />
      </Wizard>
    ),
    layoutKey: (t) => String(t >= T.goal + 120),
    cursor: [
      { at: T.goal, cue: "text:Get More Sales", click: true },
      { at: T.next1, cue: '[data-cue="next"]', click: true },
    ],
    camera: [
      { at: T.goalIn, zoom: 1, narrowZoom: 1, dur: 1 },
      { at: T.goal + 600, cue: '[data-cue="next"]', zoom: 1, narrowZoom: 1, align: "center" },
    ],
  },
  {
    id: "audience",
    worldWidth: { wide: 1140 },
    label: "Your audience",
    start: T.audienceIn,
    end: T.budgetIn,
    world: (t, l) => (
      <Wizard step="audience" narrow={nar(l)} next="Continue" pressed={pressedAt(t, T.next2)}>
        <StepAudience plan={planAt(t)} update={noop} mode="simple" />
      </Wizard>
    ),
    cursor: [
      { at: T.audience, cue: "text:Let MAIRO find my customers", click: true },
      { at: T.next2, cue: '[data-cue="next"]', click: true },
    ],
    camera: [
      { at: T.audienceIn, zoom: 1, narrowZoom: 1, dur: 1 },
      { at: T.audience + 500, cue: '[data-cue="next"]', zoom: 1, narrowZoom: 1, align: "center" },
    ],
  },
  {
    id: "budget",
    worldWidth: { wide: 1140 },
    label: "Your budget",
    start: T.budgetIn,
    end: T.adIn,
    world: (t, l) => (
      <Wizard step="budget" narrow={nar(l)} next="Continue" pressed={pressedAt(t, T.next3)}>
        <StepBudget plan={planAt(t)} update={noop} />
      </Wizard>
    ),
    cursor: [
      { at: T.budget[0], cue: 'input[aria-label="Daily budget in dollars"]', click: true },
      { at: T.next3, cue: '[data-cue="next"]', click: true },
    ],
    camera: [
      { at: T.budgetIn, zoom: 1, narrowZoom: 1, dur: 1 },
      { at: T.budget[1] + 300, cue: '[data-cue="next"]', zoom: 1, narrowZoom: 1, align: "center" },
    ],
  },
  {
    id: "ad",
    worldWidth: { wide: 1140 },
    label: "Your ad",
    start: T.adIn,
    end: T.launchIn,
    world: (t, l) => <AdStep t={t} narrow={nar(l)} />,
    layoutKey: (t) => String(t >= T.ig + 120),
    cursor: [{ at: T.ig, cue: '[data-cue="ig"]', click: true }],
    camera: [
      { at: T.adIn, zoom: 1, narrowZoom: 1, dur: 1 },
      { at: T.adIn + 800, cue: '[data-cue="preview"]', zoom: 1, narrowZoom: 1, align: "top" },
    ],
  },
  {
    id: "launch",
    worldWidth: { wide: 1140 },
    label: "Launch",
    start: T.launchIn,
    end: T.end,
    world: (t, l) => <Launch t={t} narrow={nar(l)} />,
    layoutKey: (t) => `${t >= T.agree + 120}|${t >= T.launched}`,
    cursor: [
      { at: T.agree, cue: '[data-cue="agree"]', click: true },
      { at: T.launch, cue: '[data-cue="launch"]', click: true },
      { at: T.launched + 1200, cue: '[data-cue="status"]' },
    ],
    camera: [
      { at: T.launchIn, zoom: 1, narrowZoom: 1, dur: 1 },
      { at: T.launchIn + 1000, cue: '[data-cue="agree"]', zoom: 1, narrowZoom: 1, align: "center" },
      { at: T.launched, zoom: 1.05, narrowZoom: 1, dur: 1 },
    ],
  },
];

export const CAMPAIGN_CLIP: Clip = {
  id: "campaign",
  title: "Building a Meta campaign for a fictional shop in MAIRO's campaign builder",
  duration: T.end,
  posterAt: 17000,
  captions: [
    { start: 0, end: T.goalIn, text: "With a subscription, connect your own Meta ad account. Ad spend is paid to Meta, separately." },
    { start: T.goalIn, end: T.audienceIn, text: "The campaign builder starts from your plan: a Sales campaign, sending people to your shop." },
    { start: T.audienceIn, end: T.budgetIn, text: "MAIRO suggests who to reach, and Meta refines it as results come in." },
    { start: T.budgetIn, end: T.adIn, text: "You set the budget. Meta charges it to your own ad account." },
    { start: T.adIn, end: T.launchIn, text: "Your approved creative, previewed where it will run." },
    { start: T.launchIn, end: T.launched, text: "Nothing runs until you agree to the spend and approve it." },
    { start: T.launched, end: T.end, text: "And it's shown as live only once Meta confirms it." },
  ],
  scenes: CAMPAIGN_SCENES,
};
