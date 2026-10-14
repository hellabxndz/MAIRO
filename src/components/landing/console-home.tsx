import Link from "next/link";
import { LandingNav } from "@/components/landing/landing-nav";
import { SiteFooter } from "@/components/landing/site-footer";
import { LandingBeacon } from "@/components/landing/landing-beacon";
import { PricingBlock, TrustBlock, FaqBlock } from "@/components/landing/home";
import { ConsoleHero } from "@/components/landing/console-hero";
import { ConceptShowcase, ProductTour, RevealOnScroll, SectionTitle } from "@/components/landing/console-sections";
import { WalkthroughSection } from "@/components/walkthrough/walkthrough-section";
import { DemoFrame, DemoScreen, ScaledFrame } from "@/components/console/demo";
import { TeamPanel } from "@/components/console/team";
import { MetricStrip } from "@/components/console/metrics";
import { ResultsPanel } from "@/components/console/results";
import { ActionCard } from "@/components/console/action-center";
import { Panel, Pill, SampleLabel } from "@/components/console/kit";
import { InstagramMark, MetaMark } from "@/components/mairo/marks";
import { AmbientSky } from "@/components/ambient-sky";
import { SAMPLE, sampleDaily } from "@/lib/demo/console-sample";
import { EXAMPLES } from "@/lib/demo/examples";
import { buildPreview } from "@/lib/preview/build";
import { exampleFacts } from "@/lib/preview/example";
import { USABLE_TOOLS } from "@/lib/tools/registry";
import { PLANS, STARTER_TRIAL_DAYS } from "@/lib/plans";
import { brandFont } from "@/lib/fonts";

// The homepage: MAIRO as a complete AI advertising team, told with MAIRO
// itself. Every product picture is the signed-in app's own components with
// the sample account (lib/demo/console-sample.ts), labelled as a demo — no
// separate marketing mock-ups to drift out of date.
//
//   1. Hero: the free plan, started here, and the real dashboard
//   2. Your advertising team, built with AI
//   3. From website to ad strategy — the free plan
//   4. Creatives built around your brand
//   5. Your budget, your approval — campaign creation and approval
//   6. The product tour and the walkthrough
//   7. Results, with the evidence behind every decision
//   8. Solutions, by kind of organization — only what MAIRO supports
//   9. Security and control · pricing · FAQ · the final call
//
// Rules above the design: no invented customers, reviews, counts, results or
// integrations; every figure in a picture is sample data and says so; the
// free plan is free, and a subscription is only for building and running
// real campaigns, each of which waits for the owner's approval.

const CTA = { href: "/preview", label: "Build My Free Ad Plan" };

const STEPS = [
  { n: "01", title: "Tell MAIRO about your business", body: "Your website, or a few words about it — plus your objective, industry and budget if you know them.", tag: "Free" },
  { n: "02", title: "MAIRO analyzes it", body: "It reads your public pages and shows what it found about your products, audience and goal — and where it found each fact.", tag: "Free" },
  { n: "03", title: "Confirm and get your plan", body: "Objective, Meta campaign strategy, audience, budget, three creative concepts and website fixes — built only from what you confirmed.", tag: "Free" },
  { n: "04", title: "Approve, then launch", body: "Save it to a free account and approve it. A subscription lets MAIRO build the campaign in your own Meta ad account — and it waits for your approval before it spends.", tag: "Paid to launch" },
];

const SOLUTIONS = [
  { title: "Local & service businesses", body: "Plumbers, clinics, salons, studios: leads and bookings from people near you, with enquiries followed through to the jobs they became.", available: "Available", links: [{ href: "/solutions/local-services", label: "Local services" }, { href: "/solutions/appointments", label: "Appointments" }] },
  { title: "Online stores", body: "Sales campaigns built from your products and offers, judged on purchases — with Shopify connected to measure what sold.", available: "Available", links: [{ href: "/solutions/online-stores", label: "Online stores" }] },
  { title: "Growing companies & teams", body: "Invite your team with six roles — from Owner to Viewer — checked on every change. Approvals and the audit log show who did what.", available: "Available" },
  { title: "Freelancers & agencies", body: "A workspace that keeps each client's business separate, with one login to switch between them. Studio and Agency plans aren't on sale yet.", available: "Workspace available · plans coming" },
];

const EVIDENCE = [
  { label: "Meta reports", body: "Spend, reach, clicks and the results Meta attributes to your ads." },
  { label: "MAIRO counts", body: "Enquiries from your forms, minus spam and duplicates." },
  { label: "You mark", body: "Which leads were good, which booked and which became customers." },
  { label: "Confirmed", body: "Sale values you record, or orders your store reports." },
];

export function ConsoleHome() {
  const toolsLive = USABLE_TOOLS().length > 0;
  const plan = buildPreview({ ...exampleFacts("service"), monthlyBudget: 600 })!;
  const starter = PLANS[0];
  return (
    <div className={`${brandFont.className} relative isolate min-h-screen overflow-x-hidden bg-paper text-white`}>
      <AmbientSky />
      <RevealOnScroll />
      <LandingNav toolsLive={toolsLive} cta={{ href: "/preview", label: "Get Started" }} />
      <main>
        <ConsoleHero />

        {/* Where MAIRO works — stated exactly. */}
        <section aria-label="Where MAIRO works" className="mx-auto max-w-[1360px] px-5 py-10 sm:px-8 lg:px-12">
          <div className="flex flex-col items-center gap-4 rounded-[24px] border px-6 py-5 text-center sm:flex-row sm:justify-between sm:text-left" style={{ borderColor: "var(--mairo-line)", background: "rgba(var(--mairo-fg-rgb),0.02)" }}>
            <div className="flex items-center gap-6 text-white/90">
              <span className="flex items-center gap-2 text-[18px] font-semibold tracking-[-0.02em]">
                <span className="h-6 w-6">
                  <MetaMark />
                </span>
                Facebook
              </span>
              <span className="flex items-center gap-2 text-[18px] font-semibold tracking-[-0.02em]">
                <span className="h-5 w-5">
                  <InstagramMark />
                </span>
                Instagram
              </span>
            </div>
            <p className="max-w-[660px] text-[13.5px] leading-relaxed text-white/60">
              MAIRO advertises on Facebook and Instagram through your own Meta ad account. Results come from Meta, the leads you mark and, if you connect it, your Shopify store; a ready-made Google Tag Manager container sets up your Meta pixel. Your subscription is taken through Stripe. Other ad networks aren&rsquo;t supported.
            </p>
          </div>
        </section>

        {/* 2 — the team */}
        <section id="ai-team" aria-labelledby="team-title" className="relative mx-auto max-w-[1360px] scroll-mt-20 px-5 py-20 sm:px-8 sm:py-28 lg:px-12">
          <div data-reveal>
            <SectionTitle id="team-title" eyebrow="Your AI advertising team" title={<>Your advertising team. <span className="text-white/45">Built with AI.</span></>} sub="Eight specialties of one AI system plan your strategy, write your ads, build your campaigns, guard your budget and read your results — every day, and every step on record." />
          </div>
          <div data-reveal className="mx-auto mt-12 max-w-[1180px]">
            <div className="mb-3 flex justify-end">
              <SampleLabel />
            </div>
            <div inert>
              <TeamPanel members={SAMPLE.team} intro={SAMPLE.teamIntro} />
            </div>
            <ul className="mt-6 grid gap-3 sm:grid-cols-3">
              {[
                ["Not people, not an agency", "Specialties of one AI system, each doing a defined job — and you can see every one of them working."],
                ["Every action on record", "What each one did, when, and why, in your AI Team's activity. Nothing is shown as happening that didn't."],
                ["You stay in charge", "Recommendations wait for your approval, unless you choose to let MAIRO make small changes within your limits."],
              ].map(([t, b]) => (
                <li key={t} className="rounded-[20px] border p-5" style={{ borderColor: "var(--mairo-line)" }}>
                  <p className="text-[15px] font-semibold text-white">{t}</p>
                  <p className="mt-1.5 text-[13.5px] leading-relaxed text-white/65">{b}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* 3 — the free plan */}
        <section id="how-it-works" aria-labelledby="how-title" className="relative scroll-mt-20 py-20 sm:py-28">
          <span id="free-plan" aria-hidden className="block scroll-mt-20" />
          <div className="mx-auto max-w-[1360px] px-5 sm:px-8 lg:px-12">
            <div data-reveal>
              <SectionTitle id="how-title" eyebrow="How it works" title={<>From website <span className="text-white/45">to ad strategy.</span></>} sub="See exactly how MAIRO would advertise your business — free, before you spend a dollar." />
            </div>
            <ol data-reveal className="mt-14 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              {STEPS.map((s) => (
                <li key={s.n} className="relative flex flex-col rounded-[24px] border p-6" style={{ borderColor: "var(--mairo-line)", backgroundImage: "var(--mairo-glass)", boxShadow: "var(--mairo-glow-soft)" }}>
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-[13px] text-violet-bright">{s.n}</span>
                    <Pill tone={s.tag === "Free" ? "live" : "violet"}>{s.tag}</Pill>
                  </div>
                  <p className="mt-4 text-[18px] font-semibold leading-snug tracking-[-0.02em] text-white">{s.title}</p>
                  <p className="mt-2 text-[14px] leading-relaxed text-white/65">{s.body}</p>
                </li>
              ))}
            </ol>

            {/* A real free plan, from the plan builder, for the sample business. */}
            <div data-reveal className="mt-10 grid gap-4 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
              <Panel title="What MAIRO discovered">
                <div className="mb-3">
                  <SampleLabel>Example business · sample data</SampleLabel>
                </div>
                <dl className="grid gap-3 sm:grid-cols-2">
                  {[
                    ["Business", EXAMPLES.service.name],
                    ["Products & services", EXAMPLES.service.story.cards.sell],
                    ["Audience", EXAMPLES.service.story.cards.serve],
                    ["Goal", EXAMPLES.service.story.cards.goal],
                  ].map(([k, v]) => (
                    <div key={k} className="rounded-2xl border p-3.5" style={{ borderColor: "var(--mairo-line)" }}>
                      <dt className="text-[11px] font-semibold uppercase tracking-[0.16em] text-violet-bright">{k}</dt>
                      <dd className="mt-1 text-[14px] text-white">{v}</dd>
                      <dd className="mt-1 text-[11px] text-faint">From the website · confirmed</dd>
                    </div>
                  ))}
                </dl>
              </Panel>
              <Panel title="The free plan" tone="lit">
                <p className="text-[18px] font-semibold text-white">{plan.plan.objective}</p>
                <ul className="mt-3 space-y-2">
                  {[plan.strategy.campaign, ...plan.strategy.structure.slice(0, 2), `Budget: $${plan.allocation.daily} a day, all to the first two-week test.`].map((l) => (
                    <li key={l} className="flex gap-2.5 text-[13.5px] leading-relaxed text-white/80">
                      <span aria-hidden className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-violet-bright" />
                      {l}
                    </li>
                  ))}
                </ul>
                <p className="mt-4 text-[13px] leading-relaxed text-white/60">{plan.reasons[0].text}</p>
                <Link href="/preview?example=service" className="mt-4 inline-block text-[13.5px] font-medium text-violet-200 hover:text-white">
                  Open the full example plan →
                </Link>
              </Panel>
            </div>
          </div>
        </section>

        {/* 4 — creatives */}
        <section id="creatives" aria-labelledby="creatives-title" className="relative mx-auto max-w-[1360px] scroll-mt-20 px-5 py-20 sm:px-8 sm:py-28 lg:px-12">
          <div data-reveal>
            <SectionTitle id="creatives-title" eyebrow="Creative recommendations" title={<>Creatives built <span className="text-white/45">around your brand.</span></>} sub="MAIRO recommends three directions from what your business really offers — the headline, the copy, what the picture should show and why — and shows each one where it would run." />
          </div>
          <div data-reveal className="mt-12">
            <ConceptShowcase />
            <p className="mx-auto mt-6 max-w-[760px] text-center text-[13px] leading-relaxed text-white/55">
              In your free plan, concepts are words and a direction — not finished ads. With a subscription, MAIRO makes AI pictures for your ads within your plan&rsquo;s monthly credits, or uses your own photos and videos, and you approve every ad before it runs. AI-generated video isn&rsquo;t available.
            </p>
          </div>
        </section>

        {/* 5 — approval */}
        <section id="approval" aria-labelledby="approval-title" className="relative scroll-mt-20 py-20 sm:py-28">
          <div className="mx-auto grid max-w-[1360px] gap-12 px-5 sm:px-8 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] lg:items-center lg:px-12">
            <div data-reveal>
              <SectionTitle center={false} id="approval-title" eyebrow="Campaigns and approvals" title={<>Your budget. <span className="text-white/45">Your approval.</span></>} sub="MAIRO builds the campaign in your own Meta ad account and shows you exactly what will run: the ad, the audience, the daily budget. Nothing spends until you approve it." />
              <ul className="mt-8 space-y-4">
                {[
                  ["Built in your account", "Your campaigns live in your Meta ad account, where you can always see and pause them."],
                  ["One click, budget shown", "Approve the exact ad and daily budget. Meta reviews the ad before it can run."],
                  ["Limits that hold", "Spend Protection and your caps apply to every change, and MAIRO never raises your total budget without you."],
                ].map(([t, b]) => (
                  <li key={t} className="flex gap-3">
                    <span aria-hidden className="mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-violet-500/15 text-[12px] text-violet-200">✓</span>
                    <span>
                      <span className="block text-[15px] font-semibold text-white">{t}</span>
                      <span className="mt-0.5 block text-[14px] leading-relaxed text-white/65">{b}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
            <div data-reveal>
              <ScaledFrame width={840} minScale={0.8}>
                <DemoFrame view="approvals" sidebar={false}>
                  <DemoScreen view="approvals" />
                </DemoFrame>
              </ScaledFrame>
            </div>
          </div>
        </section>

        {/* 6 — the tour */}
        <section id="tour" aria-labelledby="tour-title" className="relative mx-auto max-w-[1360px] scroll-mt-20 px-5 py-20 sm:px-8 sm:py-28 lg:px-12">
          <span id="product-preview" aria-hidden className="block scroll-mt-20" />
          <div data-reveal>
            <SectionTitle id="tour-title" eyebrow="Inside MAIRO" title={<>Your advertising team. <span className="text-white/45">Always on.</span></>} sub="Four screens of a sample account, exactly as the app draws them. Switch between them." />
          </div>
          <div data-reveal className="mt-10">
            <ProductTour />
          </div>
        </section>

        <WalkthroughSection />

        {/* 7 — results */}
        <section id="results" aria-labelledby="results-title" className="relative mx-auto max-w-[1360px] scroll-mt-20 px-5 py-20 sm:px-8 sm:py-28 lg:px-12">
          <span id="performance-coach" aria-hidden className="block scroll-mt-20" />
          <div data-reveal>
            <SectionTitle id="results-title" eyebrow="Results and recommendations" title={<>Every decision. <span className="text-white/45">Backed by evidence.</span></>} sub="Results from Meta, and the leads and sales you confirm, kept apart and labelled. Every recommendation shows the figures behind it — and waits for you." />
          </div>
          <div data-reveal className="mx-auto mt-12 max-w-[1180px]" inert>
            <div className="mb-3 flex justify-end">
              <SampleLabel />
            </div>
            <MetricStrip metrics={SAMPLE.metrics} period={SAMPLE.period} />
            <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
              <ResultsPanel points={sampleDaily()} empty={null} insights={SAMPLE.insights} period="last 14 days" count={{ key: "leads", label: "Leads" }} />
              <div className="grid gap-4 lg:grid-rows-2">
                <ActionCard item={SAMPLE.actions[0]} />
                <ActionCard item={SAMPLE.actions[2]} />
              </div>
            </div>
          </div>
          <dl data-reveal className="mx-auto mt-6 grid max-w-[1180px] gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {EVIDENCE.map((e) => (
              <div key={e.label} className="rounded-[20px] border p-4" style={{ borderColor: "var(--mairo-line)" }}>
                <dt className="text-[12px] font-semibold uppercase tracking-[0.14em] text-violet-bright">{e.label}</dt>
                <dd className="mt-1 text-[13.5px] leading-relaxed text-white/70">{e.body}</dd>
              </div>
            ))}
          </dl>
        </section>

        {/* 8 — solutions */}
        <section id="solutions" aria-labelledby="solutions-title" className="relative mx-auto max-w-[1360px] scroll-mt-20 px-5 py-20 sm:px-8 sm:py-28 lg:px-12">
          <span id="business-types" aria-hidden className="block scroll-mt-20" />
          <div data-reveal>
            <SectionTitle id="solutions-title" eyebrow="Solutions" title={<>Built to grow <span className="text-white/45">with your business.</span></>} sub="From a single location to a team with roles and approvals — described exactly as MAIRO supports them today." />
          </div>
          <ul data-reveal className="mt-12 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {SOLUTIONS.map((s) => (
              <li key={s.title} className="flex flex-col rounded-[24px] border p-6" style={{ borderColor: "var(--mairo-line)", backgroundImage: "var(--mairo-glass)", boxShadow: "var(--mairo-glow-soft)" }}>
                <Pill tone={s.available === "Available" ? "live" : "warn"} className="self-start">
                  {s.available}
                </Pill>
                <p className="mt-4 text-[18px] font-semibold tracking-[-0.02em] text-white">{s.title}</p>
                <p className="mt-2 text-[14px] leading-relaxed text-white/65">{s.body}</p>
                {"links" in s && s.links && (
                  <p className="mt-auto flex flex-wrap gap-x-4 gap-y-1 pt-4 text-[13.5px]">
                    {s.links.map((l) => (
                      <Link key={l.href} href={l.href} className="text-violet-200 hover:text-white">
                        {l.label} <span aria-hidden>→</span>
                      </Link>
                    ))}
                  </p>
                )}
              </li>
            ))}
          </ul>
          <p className="mt-6 text-center text-[13px] text-white/50">
            Not available yet: multi-step approval chains, and several brands sharing one budget or one report.{" "}
            <Link href="/for-freelancers" className="text-violet-200 hover:text-white">
              Freelancer and agency sign-up →
            </Link>
          </p>
        </section>

        <TrustBlock />
        <PricingBlock cta={CTA} />
        <FaqBlock />

        {/* The final call */}
        <section className="relative mx-auto max-w-[1360px] px-5 pb-28 pt-10 sm:px-8 lg:px-12">
          <div data-reveal className="relative overflow-hidden rounded-[36px] border px-6 py-20 text-center sm:px-12" style={{ borderColor: "rgba(121,82,255,0.35)", background: "radial-gradient(80% 120% at 50% 0%, rgba(121,82,255,0.30), transparent 60%), radial-gradient(60% 90% at 0% 100%, rgba(53,108,255,0.18), transparent 60%), #0b0d18" }}>
            <h2 className="mx-auto max-w-[900px] text-[clamp(34px,5.6vw,72px)] font-semibold leading-[0.98] tracking-[-0.05em] text-white [text-wrap:balance]">Your AI advertising team is ready.</h2>
            <p className="mx-auto mt-6 max-w-[580px] text-[17px] leading-relaxed text-white/70">See how MAIRO would advertise your business — free, with no credit card. You only subscribe when you want it to build and run your campaigns.</p>
            <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Link href={CTA.href} className="inline-flex min-h-[56px] items-center gap-2 rounded-full bg-[image:var(--mairo-ramp)] px-9 text-[16px] font-semibold text-white shadow-[var(--mairo-glow-key)] transition hover:brightness-110">
                {CTA.label} <span aria-hidden>→</span>
              </Link>
              <a href="#walkthrough" className="inline-flex min-h-[56px] items-center rounded-full border border-white/15 px-8 text-[16px] font-semibold text-white transition hover:border-violet-400/60">
                Watch MAIRO in Action
              </a>
            </div>
            <p className="mt-6 text-[13px] text-white/50">
              Plans from ${starter.priceMonthly}/month · {STARTER_TRIAL_DAYS}-day trial on {starter.name} · ad spend is paid to Meta, separately
            </p>
          </div>
        </section>
      </main>
      <SiteFooter toolsLive={toolsLive} />
      <LandingBeacon variant="story" />
    </div>
  );
}
