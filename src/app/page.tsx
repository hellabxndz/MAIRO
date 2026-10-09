import Link from "next/link";
import { Plus_Jakarta_Sans } from "next/font/google";
import type { ReactNode } from "react";
import { LandingNav } from "@/components/landing/landing-nav";
import { BusinessSelector } from "@/components/landing/business-selector";
import { FreePlanDemo } from "@/components/landing/free-plan-demo";
import { Faq } from "@/components/faq";
import { InstagramMark, MetaMark } from "@/components/mairo/marks";
import { ResultsNote } from "@/components/results-disclaimer";
import { STARTER_TRIAL_DAYS } from "@/lib/plans";
import { EVERY_PLAN, INTEGRATIONS, MONEY_AND_CONTROL, STATUS_LABEL, alwaysYours, comparison, planStories, type Cell, type IntegrationStatus } from "@/lib/pricing/compare";
import { TeamConstellation } from "@/components/landing/team-constellation";
import { TeamExplorer } from "@/components/landing/team-explorer";
import { ProductPreview } from "@/components/landing/product-preview";
import { CoachDemo } from "@/components/landing/coach-demo";
import { coachExample, EXAMPLE_STEPS, type ExampleStep, type ExampleView } from "@/lib/coach/example";

// The marketing page. Its one job: a business owner understands within
// seconds that MAIRO gives them an AI advertising team that handles the
// complicated work while they stay in control. White, with MAIRO's violet,
// soft cards, and MAIRO's own software as the only imagery — no people, no
// stock photos.
//
// Two rules above the design:
//   - Nothing claims what isn't true. No invented customer counts, ratings or
//     revenue; every figure in a product picture is labelled as sample data;
//     only platforms Mairo actually works with are shown.
//   - FREE shows what Mairo would do (the plan); PAID is Mairo doing it
//     (building, launching, optimizing). Nothing here implies a campaign runs
//     before a subscription.

// The Performance Coach demonstration: an invented business's figures, run
// through the real diagnostic engine once, when the page is built.
const COACH_EXAMPLE = Object.fromEntries(EXAMPLE_STEPS.map((s) => [s, coachExample(s)])) as Record<ExampleStep, ExampleView>;

const COACH_POINTS: { title: string; body: string }[] = [
  { title: "Follows every lead past the click", body: "You mark which enquiries were good, which booked and which paid. Your AI team follows each one from the ad to the job." },
  { title: "Finds where customers slip away", body: "Advertising, leads, qualified leads, bookings, customers, revenue — it shows the step where people drop out, and what might explain it." },
  { title: "Says what it knows — and what it doesn't", body: "Every finding shows the figures behind it and what's missing. A possible reason is never presented as the cause." },
];

const jakarta = Plus_Jakarta_Sans({ subsets: ["latin"], weight: ["400", "500", "600", "700", "800"], display: "swap" });

const PRIMARY = "bg-gradient-to-r from-[#3b6bff] to-[#8b4dfb] text-white shadow-[0_14px_44px_-12px_rgba(99,102,241,0.9)] transition hover:brightness-110";
const GRADIENT_TEXT = "bg-gradient-to-r from-[#a86bff] via-[#8a6dff] to-[#4f86ff] bg-clip-text text-transparent";
const GLASS = "border border-white/10 bg-white/[0.03] backdrop-blur-xl";

function Badge({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-violet-400/25 bg-violet-500/[0.08] px-3.5 py-1.5 text-[12.5px] font-medium text-white/90">
      <svg viewBox="0 0 16 16" className="h-3.5 w-3.5 text-violet-300" fill="currentColor" aria-hidden>
        <path d="M8 1l1.6 4.4L14 7l-4.4 1.6L8 13l-1.6-4.4L2 7l4.4-1.6z" />
      </svg>
      {children}
    </span>
  );
}

function SectionHead({ badge, title, sub }: { badge?: string; title: ReactNode; sub?: string }) {
  return (
    <div className="mx-auto max-w-[760px] text-center">
      {badge && <Badge>{badge}</Badge>}
      <h2 className="mt-4 text-[clamp(30px,4.2vw,50px)] font-bold leading-[1.08] tracking-[-0.035em] [text-wrap:balance]">{title}</h2>
      {sub && <p className="mx-auto mt-4 max-w-[620px] text-[16.5px] leading-relaxed text-white/65">{sub}</p>}
    </div>
  );
}

function Check({ children }: { children: ReactNode }) {
  return (
    <li className="flex items-center gap-2">
      <svg viewBox="0 0 16 16" className="h-4 w-4 shrink-0 text-emerald-400" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
        <path d="M3 8.5l3 3 7-7" />
      </svg>
      {children}
    </li>
  );
}


const STEPS = [
  { n: "01", title: "Tell Mairo your goal", body: "More sales, more leads, more bookings — just tell Mairo what you want.", icon: "M12 21a9 9 0 100-18 9 9 0 000 18zm0-5a4 4 0 100-8 4 4 0 000 8zm0-3a1 1 0 100-2 1 1 0 000 2z" },
  { n: "02", title: "Mairo builds your plan", body: "A custom strategy, audience, budget and creative recommendations for your business — free.", icon: "M6 3h9l4 4v14H6zM15 3v4h4M9 12h7M9 16h7" },
  { n: "03", title: "Approve & activate", body: "Review your free plan, make changes with Mairo, connect your account, and choose your subscription.", icon: "M12 21a9 9 0 100-18 9 9 0 000 18zM8 12l3 3 5-6" },
  { n: "04", title: "Mairo launches & optimizes", body: "After payment and your final approval of the campaign, Mairo launches it and checks its results every day.", icon: "M5 20V10M11 20V4M17 20v-8" },
];

const TRUST = [
  { title: "Your own Meta ad account", body: "MAIRO connects to your real Meta ad account. Your campaigns run there, and you can see every one in Meta Ads Manager.", icon: "M12 3l7 3v5c0 4.5-3 8.3-7 10-4-1.7-7-5.5-7-10V6z M9 12l2 2 4-4" },
  { title: "You approve launches", body: "Nothing goes live until you press Launch, with the budget shown first. You choose how much MAIRO may do on its own.", icon: "M12 21a9 9 0 100-18 9 9 0 000 18zM8 12l3 3 5-6" },
  { title: "You set the spending limits", body: "Budget Guardian checks every change against your caps and never raises your total budget without you.", icon: "M4 7h16v10H4zM4 11h16M8 15h3" },
  { title: "Ad spend is separate", body: "Your subscription pays for MAIRO. Your ad budget goes straight from you to Meta — MAIRO never takes a cut of it.", icon: "M12 3v18M16 7.5c0-1.9-1.8-3-4-3s-4 1.1-4 3 1.8 2.7 4 3.2 4 1.3 4 3.3-1.8 3-4 3-4-1.1-4-3" },
  { title: "Advice from your own data", body: "Recommendations come from your campaign results and what you record, with the numbers shown. MAIRO doesn't guarantee sales or returns.", icon: "M5 20V10M11 20V4M17 20v-8" },
];

const HEALTH = [
  { k: "Advertising Health", v: 88, c: "from-sky-400 to-blue-500" },
  { k: "Creative Health", v: 72, c: "from-fuchsia-400 to-pink-500" },
  { k: "Website Health", v: 81, c: "from-violet-400 to-fuchsia-500" },
  { k: "Audience Health", v: 91, c: "from-emerald-400 to-teal-400" },
  { k: "Budget Health", v: 79, c: "from-emerald-400 to-lime-400" },
];

// "Why pay for MAIRO?": the six jobs the AI team does, and who does each.
const WHY: { job: string; who: string; body: string }[] = [
  { job: "Advertising planning", who: "Strategy and Audience Agents", body: "A plan for your goal — who to reach, how much to spend and which campaign to run — written from your answers and your website. Free, before you subscribe." },
  { job: "Campaign creation", who: "Campaign and Creative Agents", body: "Builds the campaign in your own Meta ad account with ad text and pictures, checks it before launch, and waits for your approval." },
  { job: "Performance analysis", who: "Analytics Agent", body: "Reads your results every day and explains them in plain English. The Performance Coach follows leads to bookings and customers." },
  { job: "Optimization recommendations", who: "Optimization Agent and Growth Advisor", body: "Says what to change and why, with the numbers behind it — and compares results two weeks later to see whether it helped." },
  { job: "Budget monitoring", who: "Budget Guardian", body: "Checks every proposed change against your limits. Spend Protection warns you — or, if you choose, pauses a campaign." },
  { job: "Reporting", who: "Your whole AI team", body: "A Daily Brief, a weekly report and monthly results, with what Meta reports kept apart from what you confirmed." },
];

const WHY_NOT = [
  "Not a person or an agency. Its specialists are parts of one AI system.",
  "It doesn't guarantee results — advertising depends on your offer, prices, market and Meta's auction.",
  "It doesn't replace an experienced advertiser in every situation. Complex brands, regulated industries or large budgets may still be worth one.",
  "It works from your own data, and tells you when there isn't enough of it yet.",
];

const STATUS_TONE: Record<IntegrationStatus, string> = {
  full: "border-emerald-400/30 bg-emerald-400/[0.08] text-emerald-300",
  limited: "border-amber-400/35 bg-amber-400/[0.08] text-amber-300",
  pending: "border-amber-400/35 bg-amber-400/[0.08] text-amber-300",
  tracking: "border-[#3b6bff]/30 bg-[#3b6bff]/[0.07] text-[#2f5fd6]",
  billing: "border-violet-400/30 bg-violet-400/[0.08] text-violet-300",
  unsupported: "border-white/15 bg-white/[0.04] text-white/60",
};

function PlanCell({ cell, tier }: { cell: Cell; tier: string }) {
  return (
    <div role="cell" className="min-w-0 text-[13.5px]">
      <span className="block text-[11px] font-medium uppercase tracking-[0.12em] text-white/45 sm:hidden">{tier}</span>
      {cell.kind === "yes" ? (
        <span className="inline-flex items-center gap-1.5 text-white">
          <svg viewBox="0 0 16 16" className="h-4 w-4 shrink-0 text-violet-500" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden>
            <path d="M3 8.5l3 3 7-7" />
          </svg>
          <span className="sr-only">Included</span>
          {cell.note && <span className="text-[12px] text-white/55">{cell.note}</span>}
        </span>
      ) : cell.kind === "no" ? (
        <span className="text-white/35">
          <span aria-hidden>—</span>
          <span className="sr-only">Not included</span>
        </span>
      ) : (
        <span className="text-white">
          {cell.text}
          {cell.note && <span className="block text-[12px] text-white/55">{cell.note}</span>}
        </span>
      )}
    </div>
  );
}

const FAQ = [
  {
    q: "What do I get for free?",
    a: "Business setup, a website analysis and a personalized advertising plan — goal, audience, budget, creative ideas and campaign structure — which you can change with Mairo or by hand and approve. It's strategy only: a Mairo subscription is needed before Mairo builds or launches a real campaign.",
  },
  {
    q: "Do I need any advertising experience?",
    a: "No. Mairo asks plain questions about your business, writes the plan, and explains every recommendation in normal language. Advanced mode shows the full numbers when you want them.",
  },
  {
    q: "Who pays for the ads themselves?",
    a: "You do, directly to Meta, from your own ad account at the budget you approve. Your Mairo subscription is a separate bill paid through Stripe and never includes ad spend. Mairo never holds your ad money.",
  },
  {
    q: "Does Mairo change my campaigns without asking?",
    a: "Not unless you switch it on. Every campaign needs your approval before it can spend, with the budget shown first. In Manual, nothing changes without you. AI Assist (Growth and Scale) and Full Autopilot (Scale) are optional and only make the changes listed for them, inside the limits you set. Launching a campaign, raising your total budget, spending past your ceiling and connecting a new ad account always wait for you, on every plan.",
  },
  {
    q: "What's the difference between the plans?",
    a: "Every plan includes the planning, building, daily checks, recommendations, Spend Protection and reports. Growth adds optional AI Assist, every ad's results side by side and up to 15 campaigns. Scale adds optional Full Autopilot, unlimited campaigns and MAIRO Social Manager for your own Instagram and Facebook posts.",
  },
  {
    q: "What is the AI advertising team?",
    a: "Eight AI specialties of one AI system — Strategy, Audience, Creative, Campaign, Optimization, Budget Guardian, Analytics and Growth — each handling one part of your advertising and handing its work to the next. They're not people. They check your campaigns once a day and when you open MAIRO, and the AI Team screen shows exactly what each one did.",
  },
  {
    q: "Is MAIRO a replacement for an advertising agency or expert?",
    a: "For many small businesses it can do the day-to-day work — planning, building, checking and reporting. It isn't a person, it doesn't guarantee results, and some situations (complex brands, regulated industries, large budgets) may still be worth an experienced advertiser. MAIRO says when it doesn't have enough data to judge.",
  },
  {
    q: "Which platforms and tools does Mairo work with?",
    a: "Mairo manages advertising on Meta only — Facebook and Instagram, through your own Meta ad account. Shopify and Google Tag Manager are used to measure results, and Stripe takes payment for your subscription. Posting to your own Instagram and Facebook (Scale) needs Meta's approval of Mairo's posting access before it can publish.",
  },
  {
    q: "How do I pause my ads?",
    a: "Pause any campaign from Campaigns in Mairo — that always works, even without a subscription — or in Meta Ads Manager. Spend Protection can also pause a campaign for you if you set it to.",
  },
  {
    q: "What happens if I cancel?",
    a: "Mairo stops building, changing and launching campaigns. Campaigns already running stay in your Meta account and keep spending at the budgets you approved until you pause them, and pausing still works in Mairo. Your plan and settings are kept if you come back. Cancelling stops the next renewal; it doesn't refund the current month.",
  },
  {
    q: "How do I disconnect Mairo from my Meta account?",
    a: "Press Disconnect on the Meta page in Mairo, or remove Mairo in Facebook → Settings & Privacy → Settings → Business Integrations. Disconnecting deletes Mairo's access straight away but doesn't pause campaigns already running — pause them first if you want them to stop.",
  },
  {
    q: "How does the free trial work?",
    a: `The Starter plan starts with a ${STARTER_TRIAL_DAYS}-day free trial. Stripe takes your card at checkout and the first charge is after the trial. If that payment doesn't go through, Mairo pauses your campaigns and cancels the subscription — your plan stays saved. Growth and Scale don't have a trial; they're billed from the day you subscribe.`,
  },
  {
    q: "Can Mairo guarantee results?",
    a: "No one honestly can. Mairo works from what you tell it and what your ad account reports, shows the data behind every recommendation, and tells you when it doesn't have enough data yet.",
  },
];

function money(n: number): string {
  return Number.isInteger(n) ? `$${n}` : `$${n.toFixed(2)}`;
}

export default function Home() {
  return (
    <div className={`${jakarta.className} relative min-h-screen overflow-x-hidden bg-paper text-white`}>
      <LandingNav />

      {/* ── Hero ─────────────────────────────────────────────────────── */}
      <section id="product" className="relative isolate scroll-mt-20 overflow-hidden pt-[104px] sm:pt-[120px]">
        {/* One soft glow behind the team — nothing that competes with it. */}
        <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(ellipse_55%_60%_at_74%_44%,rgba(109,77,255,0.14),transparent_70%),radial-gradient(ellipse_40%_40%_at_12%_8%,rgba(59,107,255,0.06),transparent_70%)]" />

        <div className="mx-auto grid max-w-[1360px] grid-cols-1 items-center gap-12 px-5 sm:px-8 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)] lg:gap-10 lg:px-12">
          <div className="min-w-0">
            <Badge>Your AI advertising team for Facebook &amp; Instagram</Badge>
            <h1 className="mt-6 text-[clamp(38px,4.6vw,68px)] font-extrabold leading-[1.02] tracking-[-0.045em] [text-wrap:balance]">
              Meet Your New <span className={GRADIENT_TEXT}>AI Advertising Team.</span>
            </h1>
            <p className="mt-6 max-w-[580px] text-[clamp(16.5px,1.4vw,19.5px)] leading-relaxed text-white/75">
              Eight AI specialties working together to create, manage, and improve your Facebook and Instagram ads. All from one simple dashboard.
            </p>
            <p className="mt-5 flex items-start gap-3 text-[15px] font-semibold leading-snug text-white">
              <span aria-hidden className="mt-[0.7em] h-px w-8 shrink-0 bg-[image:var(--mairo-ramp)]" />
              <span>You run the business. Your AI team handles the advertising.</span>
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link href="/sign-up" className={`${PRIMARY} inline-flex min-h-[56px] items-center justify-center gap-2 rounded-full px-8 text-[16px] font-semibold`}>
                Get My Free Advertising Plan <span aria-hidden>→</span>
              </Link>
              <a href="#ai-team" className="inline-flex min-h-[56px] items-center justify-center gap-2.5 rounded-full border border-white/15 bg-paper px-7 text-[16px] font-semibold text-white transition hover:border-[color:var(--mairo-line-lit)]">
                Meet My AI Team
              </a>
            </div>
            <ul className="mt-6 flex flex-wrap gap-x-6 gap-y-2 text-[13.5px] text-white/70">
              <Check>Free plan, no credit card</Check>
              <Check>Runs on your own Meta ad account</Check>
              <Check>You approve every launch</Check>
            </ul>
          </div>

          <div className="relative min-w-0">
            <TeamConstellation />
          </div>
        </div>

        {/* ── Platform bar ──────────────────────────────────────────── */}
        <div id="platforms" className="mx-auto mt-20 max-w-[1360px] px-5 sm:px-8 lg:px-12">
          <div className={`flex flex-col gap-8 rounded-[28px] ${GLASS} px-6 py-7 sm:px-9 lg:flex-row lg:items-center lg:justify-between`}>
            <div className="min-w-0">
              <p className="text-[13px] text-white/55">Advertising on</p>
              <ul className="mt-3 flex flex-wrap items-center gap-x-8 gap-y-3 text-white/85">
                <li className="flex items-center gap-2 text-[21px] font-semibold tracking-[-0.02em]"><span className="h-6 w-6"><MetaMark /></span> Facebook</li>
                <li className="flex items-center gap-2 text-[21px] font-semibold tracking-[-0.02em]"><span className="h-5 w-5"><InstagramMark /></span> Instagram</li>
              </ul>
              <p className="mt-4 text-[13px] text-white/55">
                Also connects to <span className="text-white/80">Shopify</span> and <span className="text-white/80">Google Tag Manager</span> to measure results, and <span className="text-white/80">Stripe</span> for your subscription.{" "}
                <a href="#integrations" className="text-violet-300 hover:text-white">What each connection does →</a>
              </p>
            </div>
            <dl className="grid shrink-0 grid-cols-1 gap-5 border-white/10 sm:grid-cols-3 lg:border-l lg:pl-9">
              {[
                ["Facebook + Instagram", "One dashboard"],
                ["AI powered", "Checks your ads every day"],
                ["Simple + Advanced", "Built for any experience level"],
              ].map(([a, b]) => (
                <div key={a}>
                  <dt className="text-[16px] font-semibold text-white">{a}</dt>
                  <dd className="mt-0.5 text-[12.5px] text-white/55">{b}</dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
      </section>

      {/* ── You stay in control ──────────────────────────────────────── */}
      <section id="trust" aria-labelledby="trust-title" className="relative mx-auto max-w-[1360px] scroll-mt-20 px-5 pt-20 sm:px-8 lg:px-12">
        <div className="mx-auto max-w-[760px] text-center">
          <Badge>YOU STAY IN CONTROL</Badge>
          <h2 id="trust-title" className="mt-4 text-[clamp(28px,3.6vw,42px)] font-bold leading-[1.1] tracking-[-0.035em] [text-wrap:balance]"><span className="inline-block">Your account.</span> <span className="inline-block">Your approval.</span> <span className="inline-block">Your money.</span></h2>
        </div>
        <ul className="mt-10 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {TRUST.map((t) => (
            <li key={t.title} className={`rounded-2xl ${GLASS} p-5`}>
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-violet/10 text-violet-bright">
                <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d={t.icon} />
                </svg>
              </span>
              <p className="mt-3 text-[15px] font-semibold leading-snug text-white">{t.title}</p>
              <p className="mt-1.5 text-[13.5px] leading-relaxed text-white/65">{t.body}</p>
            </li>
          ))}
        </ul>
      </section>

      {/* ── Your AI advertising team ──────────────────────────────────── */}
      <section id="ai-team" className="relative mx-auto max-w-[1360px] scroll-mt-20 px-5 py-20 sm:px-8 lg:px-12">
        <div aria-hidden className="pointer-events-none absolute inset-x-0 top-24 -z-10 mx-auto h-[420px] max-w-[1000px] rounded-full bg-violet-600/15 blur-[120px]" />
        <SectionHead
          badge="YOUR AI ADVERTISING TEAM"
          title={<><span className="inline-block">Eight specialties.</span> <span className="inline-block">One team.</span> <span className="inline-block">You in charge.</span></>}
          sub="Each specialty handles one part of your advertising and hands its work to the next. Your approval is a step of its own, and Budget Guardian watches every one."
        />
        <TeamExplorer />
        <p className="mx-auto mt-8 max-w-[820px] text-center text-[13px] leading-relaxed text-white/55">
          Eight AI specialties of one AI system — not eight people, and not eight separate programs. Every line on your AI Team screen is
          something that really ran, and every recommendation shows the numbers it&rsquo;s based on. MAIRO can&rsquo;t promise sales or a
          particular return.
        </p>
        <div className="mt-8 text-center">
          <Link href="/sign-up" className={`${PRIMARY} inline-flex min-h-[54px] items-center gap-2 rounded-full px-8 text-[15.5px] font-semibold`}>
            Get My Free Advertising Plan <span aria-hidden>→</span>
          </Link>
        </div>
      </section>

      {/* ── See MAIRO at work ───────────────────────────────────────── */}
      <section id="product-preview" className="relative mx-auto max-w-[1360px] scroll-mt-20 px-5 py-20 sm:px-8 lg:px-12">
        {/* Older links to the sections this replaced still land here. */}
        <span id="dashboard" aria-hidden className="block scroll-mt-20" />
        <span id="decisions" aria-hidden className="block scroll-mt-20" />
        <SectionHead
          badge="SEE MAIRO AT WORK"
          title={<><span className="inline-block">One dashboard.</span> <span className={`inline-block ${GRADIENT_TEXT}`}>Your whole advertising team.</span></>}
          sub="Click through the screens you'd use: your AI team, your results, recommendations waiting for you, your Performance Coach and your Daily Brief."
        />
        <div className="mx-auto mt-12 max-w-[1120px]">
          <ProductPreview />
        </div>
      </section>

      {/* ── Performance Coach ────────────────────────────────────────── */}
      <section id="performance-coach" aria-labelledby="coach-title" className="relative mx-auto max-w-[1360px] scroll-mt-20 px-5 py-20 sm:px-8 lg:px-12">
        <div className="mx-auto max-w-[820px] text-center">
          <Badge>PERFORMANCE COACH</Badge>
          <h2 id="coach-title" className="mt-4 text-[clamp(30px,4.2vw,50px)] font-bold leading-[1.08] tracking-[-0.035em] [text-wrap:balance]">
            Your AI Team Doesn&rsquo;t Just Run Ads. <span className={GRADIENT_TEXT}>It Helps You Understand Why They Work.</span>
          </h2>
          <p className="mx-auto mt-4 max-w-[660px] text-[16.5px] leading-relaxed text-white/65">
            A click isn&rsquo;t a customer. MAIRO&rsquo;s Performance Coach looks past the ad — at which leads were good, which booked and which paid — and when results slip, it shows you where, what might explain it, and what your AI team would do about it.
          </p>
        </div>
        <ul className="mx-auto mt-10 grid max-w-[1120px] gap-4 md:grid-cols-3">
          {COACH_POINTS.map((p) => (
            <li key={p.title} className="rounded-[22px] border border-white/10 bg-paper p-5">
              <p className="text-[15px] font-semibold text-white">{p.title}</p>
              <p className="mt-1.5 text-[13.5px] leading-relaxed text-white/65">{p.body}</p>
            </li>
          ))}
        </ul>
        <div className="mx-auto mt-10 max-w-[1120px]">
          <p className="mb-3 text-center text-[13.5px] text-muted">
            Step through an example: a roofing company gets 25 leads, but only 4 turn out to be qualified.
          </p>
          <CoachDemo views={COACH_EXAMPLE} />
        </div>
      </section>

      {/* ── How it works ─────────────────────────────────────────────── */}
      <section id="how-it-works" className="relative mx-auto max-w-[1360px] scroll-mt-20 px-5 py-24 sm:px-8 lg:px-12">
        <SectionHead
          badge="HOW IT WORKS"
          title="From your goal to a live campaign."
          sub="Mairo handles the strategy, creative, targeting, and optimization — so you don’t have to."
        />
        <ol className="relative mt-14 grid grid-cols-1 gap-10 lg:grid-cols-4 lg:gap-6">
          {/* The timeline line on phones. */}
          <span aria-hidden className="absolute bottom-6 left-[31px] top-6 w-px bg-gradient-to-b from-violet-500/60 via-violet-500/30 to-transparent lg:hidden" />
          {STEPS.map((s, i) => (
            <li key={s.n} className="relative flex gap-5 lg:flex-col lg:gap-0">
              <div className="flex items-center gap-4">
                <span className="relative z-10 flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#7c4dff] to-[#4f6dff] text-[20px] font-bold shadow-[0_0_40px_-4px_rgba(124,77,255,0.85)]">
                  {s.n}
                </span>
                {i < STEPS.length - 1 && (
                  <svg aria-hidden viewBox="0 0 80 12" className="hidden h-3 flex-1 text-violet-400/70 lg:block">
                    <path d="M0 6h74m-6-5l6 5-6 5" fill="none" stroke="currentColor" strokeWidth="1.5" />
                  </svg>
                )}
              </div>
              <div className="lg:mt-6 lg:pr-6">
                <svg viewBox="0 0 24 24" className="h-7 w-7 text-violet-300" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d={s.icon} />
                </svg>
                <p className="mt-3 text-[18px] font-semibold">{s.title}</p>
                <p className="mt-2 text-[14.5px] leading-relaxed text-white/60">{s.body}</p>
              </div>
            </li>
          ))}
        </ol>
        <p className="mx-auto mt-12 max-w-[900px] text-center text-[13px] leading-relaxed text-white/45">
          Free plan → edit plan → approve plan → connect ad account → choose subscription → pay → Mairo builds the campaign → your final approval → launch.
        </p>
      </section>

      {/* ── Built for your business ─────────────────────────────────── */}
      <section id="business-types" className="relative mx-auto max-w-[1360px] scroll-mt-20 px-5 py-20 sm:px-8 lg:px-12">
        <SectionHead badge="BUILT FOR YOUR BUSINESS" title="See how Mairo would advertise your business." />
        <div className="mt-10">
          <BusinessSelector />
        </div>
      </section>

      {/* ── Free plan ────────────────────────────────────────────────── */}
      <section id="free-plan" className="relative mx-auto max-w-[1360px] scroll-mt-20 px-5 py-20 sm:px-8 lg:px-12">
        <div aria-hidden className="pointer-events-none absolute inset-x-0 top-10 -z-10 mx-auto h-[420px] max-w-[900px] rounded-full bg-violet-600/15 blur-[120px]" />
        <SectionHead
          badge="YOUR FREE PLAN"
          title="See your advertising plan before you pay."
          sub="Tell Mairo about your business and get a personalized advertising strategy for free."
        />
        <div className="mt-12">
          <FreePlanDemo />
        </div>
        <div className={`mx-auto mt-8 max-w-[860px] rounded-2xl ${GLASS} px-6 py-5 text-center`}>
          <p className="text-[15px] font-semibold text-white">Your free plan is strategy only.</p>
          <p className="mt-1 text-[14px] text-white/60">A Mairo subscription is required before a real campaign is created or launched. Mairo shows you the strategy for free — you subscribe when you want Mairo to actually do it.</p>
        </div>
      </section>

      {/* ── Business Health ──────────────────────────────────────────── */}
      <section id="health" className="relative mx-auto max-w-[1360px] scroll-mt-20 px-5 py-20 sm:px-8 lg:px-12">
        <div className="grid grid-cols-1 items-center gap-12 lg:grid-cols-[1fr_1.05fr]">
          <div className={`order-2 rounded-3xl ${GLASS} p-6 sm:p-8 lg:order-1`}>
            <div className="flex items-center justify-between">
              <p className="text-[15px] font-semibold">Business Health</p>
              <span className="rounded-full border border-white/15 px-2 py-0.5 text-[10px] uppercase tracking-[0.14em] text-white/55">Sample</span>
            </div>
            <p className="mt-3 text-[48px] font-bold leading-none tracking-[-0.03em]">
              84<span className="text-[20px] font-medium text-white/45"> / 100</span>
            </p>
            <ul className="mt-6 space-y-4">
              {HEALTH.map((h) => (
                <li key={h.k}>
                  <div className="flex justify-between text-[13.5px]">
                    <span className="text-white/75">{h.k}</span>
                    <span className="tabular-nums text-white">{h.v}</span>
                  </div>
                  <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-white/[0.07]">
                    <div className={`h-full rounded-full bg-gradient-to-r ${h.c}`} style={{ width: `${h.v}%` }} />
                  </div>
                </li>
              ))}
            </ul>
          </div>
          <div className="order-1 lg:order-2">
            <Badge>BUSINESS HEALTH</Badge>
            <h2 className="mt-4 text-[clamp(30px,4vw,48px)] font-bold leading-[1.08] tracking-[-0.035em]">
              More than ad metrics.
              <br />
              <span className={GRADIENT_TEXT}>See the health of your entire advertising system.</span>
            </h2>
            <p className="mt-5 max-w-[520px] text-[16px] leading-relaxed text-white/65">
              Your ads, creative, website, audience and budget, scored in one place so you can see what&rsquo;s holding results back.
            </p>
            <p className="mt-3 max-w-[520px] text-[13.5px] leading-relaxed text-white/45">
              Business Health appears once a real campaign is running and there&rsquo;s enough data to measure — Mairo never fills it with guesses.
            </p>
          </div>
        </div>
      </section>

      {/* ── Why pay for MAIRO? ───────────────────────────────────────── */}
      <section id="why-mairo" aria-labelledby="why-title" className="relative mx-auto max-w-[1360px] scroll-mt-20 px-5 py-20 sm:px-8 lg:px-12">
        <div className="mx-auto max-w-[780px] text-center">
          <Badge>WHY PAY FOR MAIRO</Badge>
          <h2 id="why-title" className="mt-4 text-[clamp(30px,4.2vw,50px)] font-bold leading-[1.08] tracking-[-0.035em] [text-wrap:balance]">Why pay for MAIRO?</h2>
          <p className="mx-auto mt-4 max-w-[640px] text-[16.5px] leading-relaxed text-white/65">
            Running ads well is six jobs that never stop. MAIRO&rsquo;s AI team does each of them for your business, every day, in your own Meta ad account — and asks you before anything that matters.
          </p>
        </div>
        <ol className="mt-12 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {WHY.map((w, i) => (
            <li key={w.job} className={`flex flex-col rounded-3xl ${GLASS} p-6`}>
              <span className="text-[12px] font-semibold tabular-nums text-violet-300">0{i + 1}</span>
              <h3 className="mt-2 text-[19px] font-semibold tracking-[-0.02em] text-white">{w.job}</h3>
              <p className="mt-1 text-[12.5px] font-medium text-white/55">{w.who}</p>
              <p className="mt-3 text-[14.5px] leading-relaxed text-white/75">{w.body}</p>
            </li>
          ))}
        </ol>
        <div className="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div className="rounded-3xl border border-violet-400/25 bg-gradient-to-br from-violet-500/[0.08] to-transparent p-6 sm:p-7">
            <h3 className="text-[17px] font-semibold text-white">What your subscription pays for</h3>
            <p className="mt-2 text-[14.5px] leading-relaxed text-white/75">
              The work, done every day by a coordinated AI system: one specialist reads your results, another proposes a change, the Budget Guardian checks it against your limits, and you decide. Your ad budget is separate and goes straight to Meta.
            </p>
          </div>
          <div className={`rounded-3xl ${GLASS} p-6 sm:p-7`}>
            <h3 className="text-[17px] font-semibold text-white">What MAIRO isn&rsquo;t</h3>
            <ul className="mt-3 space-y-2 text-[14px] leading-relaxed text-white/75">
              {WHY_NOT.map((w) => (
                <li key={w} className="flex gap-2.5">
                  <span aria-hidden className="mt-[9px] h-1 w-1 shrink-0 rounded-full bg-white/40" />
                  {w}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* ── Pricing ──────────────────────────────────────────────────── */}
      <section id="pricing" className="relative mx-auto max-w-[1360px] scroll-mt-20 px-5 py-20 sm:px-8 lg:px-12">
        <SectionHead
          badge="PRICING"
          title="Three plans. The difference is how much MAIRO does on its own."
          sub="Every plan includes your AI team's planning, building, daily checks, recommendations and reports. Your plan is free to make — you only subscribe when you want MAIRO to build and run it."
        />
        <div className="mt-12 grid grid-cols-1 gap-4 md:grid-cols-3">
          {planStories().map((plan) => (
            <article
              key={plan.tier}
              aria-labelledby={`plan-${plan.tier}`}
              className={`relative flex min-w-0 flex-col rounded-3xl p-6 sm:p-7 ${
                plan.featured ? "border border-violet-400/45 bg-gradient-to-b from-violet-500/[0.12] to-white/[0.02] shadow-[0_30px_80px_-30px_rgba(124,77,255,0.55)]" : GLASS
              }`}
            >
              {plan.featured && (
                <span className="absolute -top-3 left-6 rounded-full bg-gradient-to-r from-[#3b6bff] to-[#8b4dfb] px-3 py-1 text-[11px] font-medium text-white">Recommended</span>
              )}
              <h3 id={`plan-${plan.tier}`} className="text-[18px] font-semibold">{plan.name}</h3>
              <p className="mt-0.5 text-[13px] text-white/55 md:min-h-[38px]">{plan.forWho}</p>
              <p className="mt-4 flex items-baseline gap-1">
                <span className="text-[40px] font-bold tracking-[-0.03em] tabular-nums">{money(plan.price)}</span>
                <span className="text-[13px] text-white/50">/month</span>
              </p>
              <p className="mt-1 h-[18px] text-[12.5px] font-medium text-emerald-300">{plan.trialDays ? `${plan.trialDays}-day free trial` : ""}</p>
              <p className="mt-3 text-[14.5px] leading-relaxed text-white/80">{plan.outcome}</p>
              <div className="mt-4">
                <p className="text-[11.5px] font-semibold uppercase tracking-[0.14em] text-white/45">Automation you can choose</p>
                <ul className="mt-2 flex flex-wrap gap-1.5" aria-label={`Automation modes on ${plan.name}`}>
                  {plan.modes.map((m) => (
                    <li key={m} className="rounded-full border border-violet-400/30 bg-violet-500/[0.06] px-2.5 py-1 text-[12px] font-medium text-violet-300">{m}</li>
                  ))}
                </ul>
              </div>
              <ul className="mt-5 flex-1 space-y-2 text-[13.5px] text-white/80">
                {plan.highlights.map((f) => (
                  <li key={f} className="flex gap-2.5">
                    <span aria-hidden className="mt-[3px] text-[11px] text-violet-300">✓</span>
                    {f}
                  </li>
                ))}
              </ul>
              <Link
                href="/sign-up"
                className={`mt-6 rounded-full py-3 text-center text-[14px] font-medium ${plan.featured ? PRIMARY : "border border-white/15 transition hover:border-white/35"}`}
              >
                Start with your free plan <span aria-hidden>→</span>
              </Link>
            </article>
          ))}
        </div>
        <p className="mt-4 text-center text-[12.5px] text-white/50">Prices in US dollars, billed monthly. Cancel any time; cancelling stops the next renewal.</p>

        <div className={`mt-10 rounded-3xl ${GLASS} p-6 sm:p-8`}>
          <h3 className="text-[18px] font-semibold text-white">Included in every plan</h3>
          <ul className="mt-5 grid grid-cols-1 gap-x-8 gap-y-5 sm:grid-cols-2 lg:grid-cols-4">
            {EVERY_PLAN.map((e) => (
              <li key={e.title}>
                <p className="text-[14.5px] font-semibold text-white">{e.title}</p>
                <p className="mt-1 text-[13px] leading-relaxed text-white/65">{e.body}</p>
              </li>
            ))}
          </ul>
        </div>

        <div className={`mt-6 overflow-hidden rounded-3xl ${GLASS}`} role="table" aria-label="Compare Starter, Growth and Scale">
          <div role="row" className="hidden grid-cols-[minmax(0,1.7fr)_repeat(3,minmax(0,1fr))] gap-4 border-b border-white/10 bg-white/[0.03] px-6 py-4 sm:grid">
            <span role="columnheader" className="text-[13px] font-semibold text-white/60">Compare plans</span>
            {planStories().map((p) => (
              <span key={p.tier} role="columnheader" className="text-[14px] font-semibold text-white">{p.name}</span>
            ))}
          </div>
          {comparison().map((g) => (
            <div key={g.key} role="rowgroup">
              <div role="row" className="border-b border-white/[0.07] px-6 pb-2 pt-5">
                <span role="rowheader" className="text-[11.5px] font-semibold uppercase tracking-[0.16em] text-violet-300">{g.title}</span>
              </div>
              {g.rows.map((r) => (
                <div key={r.key} role="row" className="grid grid-cols-3 gap-x-4 gap-y-2 border-b border-white/[0.06] px-6 py-4 last:border-b-0 sm:grid-cols-[minmax(0,1.7fr)_repeat(3,minmax(0,1fr))] sm:items-start">
                  <div role="rowheader" className="col-span-3 min-w-0 sm:col-span-1">
                    <p className="text-[14px] font-medium text-white">{r.label}</p>
                    {r.help && <p className="mt-0.5 text-[12.5px] leading-relaxed text-white/55">{r.help}</p>}
                  </div>
                  <PlanCell cell={r.cells.STARTER} tier="Starter" />
                  <PlanCell cell={r.cells.GROWTH} tier="Growth" />
                  <PlanCell cell={r.cells.SCALE} tier="Scale" />
                </div>
              ))}
            </div>
          ))}
        </div>

        <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
          <div className="rounded-3xl border border-violet-400/30 bg-violet-500/[0.05] p-6 sm:p-7">
            <h3 className="text-[17px] font-semibold text-white">Always your decision — on every plan, in every mode</h3>
            <ul className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
              {alwaysYours().map((a) => (
                <li key={a.label}>
                  <p className="text-[14px] font-semibold text-white">{a.label}</p>
                  <p className="mt-0.5 text-[12.5px] leading-relaxed text-white/60">{a.detail}</p>
                </li>
              ))}
            </ul>
          </div>
          <div className={`rounded-3xl ${GLASS} p-6 sm:p-7`}>
            <h3 className="text-[17px] font-semibold text-white">Two separate bills</h3>
            <dl className="mt-4 space-y-3 text-[14px]">
              <div>
                <dt className="font-semibold text-white">Your MAIRO subscription</dt>
                <dd className="text-white/65">Paid to MAIRO through Stripe. Pays for the work. Never includes ad spend.</dd>
              </div>
              <div>
                <dt className="font-semibold text-white">Your ad budget</dt>
                <dd className="text-white/65">Paid to Meta from your own ad account, at the budget you approve. MAIRO never holds it or takes a cut.</dd>
              </div>
            </dl>
          </div>
        </div>
        <p className="mx-auto mt-6 max-w-3xl text-center text-[13px] leading-relaxed text-white/50">
          <Link href="/for-freelancers" className="text-violet-300 hover:text-white">Running ads for clients? Sign up as a freelancer or agency →</Link>
        </p>
        <ResultsNote className="mx-auto mt-3 max-w-3xl text-center" />
      </section>

      {/* ── Money and control ────────────────────────────────────────── */}
      <section id="control" aria-labelledby="control-title" className="relative mx-auto max-w-[1360px] scroll-mt-20 px-5 py-20 sm:px-8 lg:px-12">
        <div className="mx-auto max-w-[760px] text-center">
          <Badge>MONEY AND CONTROL</Badge>
          <h2 id="control-title" className="mt-4 text-[clamp(28px,3.8vw,44px)] font-bold leading-[1.1] tracking-[-0.035em] [text-wrap:balance]">How money, approvals and control work</h2>
          <p className="mx-auto mt-4 max-w-[600px] text-[16px] leading-relaxed text-white/65">The plain answers, before you sign up.</p>
        </div>
        <dl className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {MONEY_AND_CONTROL.map((m) => (
            <div key={m.key} id={`control-${m.key}`} className={`rounded-2xl ${GLASS} p-5`}>
              <dt className="text-[15px] font-semibold leading-snug text-white">{m.title}</dt>
              <dd className="mt-2 text-[13.5px] leading-relaxed text-white/70">{m.body}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-6 text-center text-[13px] text-white/55">
          The same rules are in our <Link href="/terms" className="text-violet-300 hover:text-white">Terms</Link>, and how to remove your data is on the{" "}
          <Link href="/data-deletion" className="text-violet-300 hover:text-white">data deletion page</Link>.
        </p>
      </section>

      {/* ── Integrations ─────────────────────────────────────────────── */}
      <section id="integrations" aria-labelledby="integrations-title" className="relative mx-auto max-w-[1360px] scroll-mt-20 px-5 py-20 sm:px-8 lg:px-12">
        <div className="mx-auto max-w-[760px] text-center">
          <Badge>INTEGRATIONS</Badge>
          <h2 id="integrations-title" className="mt-4 text-[clamp(28px,3.8vw,44px)] font-bold leading-[1.1] tracking-[-0.035em] [text-wrap:balance]">What MAIRO connects to — and what for</h2>
          <p className="mx-auto mt-4 max-w-[620px] text-[16px] leading-relaxed text-white/65">MAIRO manages advertising on Meta only. Everything else here measures your results or takes payment.</p>
        </div>
        <ul className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {INTEGRATIONS.map((i) => (
            <li key={i.key} className={`flex flex-col rounded-2xl ${GLASS} p-5`} data-integration={i.key} data-status={i.status}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-[15.5px] font-semibold text-white">{i.name}</p>
                <span className={`rounded-full border px-2.5 py-0.5 text-[11.5px] font-medium ${STATUS_TONE[i.status]}`}>{STATUS_LABEL[i.status]}</span>
              </div>
              <p className="mt-2 text-[13.5px] leading-relaxed text-white/75">{i.what}</p>
              {i.limits && <p className="mt-2 text-[12.5px] leading-relaxed text-white/55">{i.limits}</p>}
            </li>
          ))}
        </ul>
      </section>

      {/* ── FAQ ──────────────────────────────────────────────────────── */}
      <section id="faq" className="relative mx-auto max-w-[1100px] scroll-mt-20 px-5 py-20 sm:px-8 lg:px-12">
        <SectionHead badge="FAQ" title="Questions, answered." />
        <div className="mt-10">
          <Faq items={FAQ} />
        </div>
      </section>

      {/* ── Final call ───────────────────────────────────────────────── */}
      <section className="relative mx-auto max-w-[1360px] px-5 pb-24 pt-8 sm:px-8 lg:px-12">
        <div className="relative overflow-hidden rounded-[32px] border border-violet-400/25 bg-[radial-gradient(90%_120%_at_80%_0%,rgba(99,102,241,0.16),transparent_55%),radial-gradient(70%_100%_at_10%_100%,rgba(139,92,246,0.14),transparent_60%),linear-gradient(135deg,#f6f3ff,#ffffff)] px-6 py-16 text-center sm:px-12">
          <h2 className="mx-auto max-w-[820px] text-[clamp(32px,5vw,56px)] font-bold leading-[1.05] tracking-[-0.04em]">
            <span className="inline-block">You run the business.</span> <span className={`inline-block ${GRADIENT_TEXT}`}>Your AI team handles the advertising.</span>
          </h2>
          <p className="mx-auto mt-5 max-w-xl text-[16px] leading-relaxed text-white/70">
            Start with a free, personalized advertising plan. See exactly how your AI team would approach your advertising before you subscribe.
          </p>
          <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link href="/sign-up" className={`${PRIMARY} inline-flex min-h-[58px] items-center gap-2 rounded-full px-9 text-[16px] font-semibold`}>
              Get My Free Advertising Plan <span aria-hidden>→</span>
            </Link>
            <a href="#ai-team" className="inline-flex min-h-[58px] items-center rounded-full border border-white/15 bg-paper px-8 text-[16px] font-semibold text-white transition hover:border-[color:var(--mairo-line-lit)]">
              Meet My AI Team
            </a>
          </div>
          <ul className="mx-auto mt-7 flex max-w-[760px] flex-wrap justify-center gap-x-6 gap-y-2 text-[13.5px] text-white/70">
            <Check>No credit card required</Check>
            <Check>Personalized for your business</Check>
            <Check>Edit the plan with Mairo</Check>
            <Check>Pay only when you are ready to activate it</Check>
          </ul>
        </div>
      </section>

      {/* ── Footer ───────────────────────────────────────────────────── */}
      <footer className="border-t border-white/[0.06] px-5 py-14 sm:px-8">
        <div className="mx-auto grid max-w-[1360px] grid-cols-2 gap-10 sm:grid-cols-4">
          <div className="col-span-2 sm:col-span-1">
            <p className="text-[18px] font-light tracking-[0.34em] text-white">MAIRO</p>
            <p className="mt-3 max-w-[240px] text-[13px] leading-relaxed text-white/50">Your AI advertising team for Facebook &amp; Instagram. You run the business — your AI team handles the advertising.</p>
            <p className="mt-4 text-[12px] text-white/35">© {new Date().getFullYear()} Mairo</p>
          </div>
          {[
            { h: "Product", l: [["Your AI team", "#ai-team"], ["See MAIRO at work", "#product-preview"], ["Performance Coach", "#performance-coach"], ["Why MAIRO", "#why-mairo"], ["Pricing", "#pricing"], ["Integrations", "#integrations"]] },
            { h: "Resources", l: [["Your free plan", "#free-plan"], ["Money and control", "#control"], ["FAQ", "#faq"], ["Sign up as a freelancer or agency", "/for-freelancers"]] },
            { h: "Company", l: [["Sign in", "/sign-in"], ["Privacy", "/privacy"], ["Terms", "/terms"], ["Data deletion", "/data-deletion"]] },
          ].map((col) => (
            <div key={col.h}>
              <p className="text-[13px] font-semibold text-white">{col.h}</p>
              <ul className="mt-4 space-y-2.5 text-[13px] text-white/55">
                {col.l.map(([label, href]) => (
                  <li key={label}>
                    {href.startsWith("#") ? (
                      <a href={href} className="hover:text-white">{label}</a>
                    ) : (
                      <Link href={href} className="hover:text-white">{label}</Link>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </footer>
    </div>
  );
}
