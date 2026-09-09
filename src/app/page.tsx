import Link from "next/link";
import { GalaxyBackground } from "@/components/galaxy/galaxy-background";
import { SpacePanel } from "@/components/space-panel";
import { Grain } from "@/components/grain";
import { SiteNav } from "@/components/site-nav";
import { CinematicIntro } from "@/components/intro/cinematic-intro";
import { ReplayIntroLink } from "@/components/intro/replay-intro-link";
import { Reveal } from "@/components/reveal";
import { TextReveal } from "@/components/text-reveal";
import { Magnetic } from "@/components/magnetic";
import { ConceptDemo } from "@/components/concept-demo";
import { PLANS, FREELANCER_PLANS } from "@/lib/plans";

// The marketing page.
//
// One continuous environment rather than a stack of sections: the starfield and
// the nebulae are fixed behind everything and drift with the scroll, so moving
// down the page reads as travelling through it. Sections have no hard
// boundaries — they are separated by very large amounts of empty space and by
// the background showing through, not by rules and boxes.
//
// The type does the work. Headlines are enormous and light rather than bold,
// body copy is small by comparison, and the ratio between them is most of what
// makes the page feel expensive.

const capabilities = [
  {
    eyebrow: "Ask",
    title: "Talk to it\nlike a person.",
    body:
      "Three specialists, always available. Ask why your cost per click moved, what to do with $500, whether a campaign is worth keeping. Plain English in, plain English back.",
    panel: "Strategist",
    lines: [
      { who: "you", text: "why did my cost per click go up this week?" },
      {
        who: "ai",
        text:
          "Your audience is small enough that Meta ran out of cheap places to show the ad. Widening the radius to 20 miles should bring it back down.",
      },
    ],
  },
  {
    eyebrow: "Plan",
    title: "A month of work,\nwritten in a minute.",
    body:
      "Tell it the goal and the budget. It comes back with the campaigns, how the money splits across them, what to expect in week one versus week four, and where it thinks the budget is too thin to work.",
    panel: "Monthly plan",
    metrics: [
      { k: "Cost per lead", v: "$25–45" },
      { k: "Click-through", v: "1%+" },
      { k: "Leads, month one", v: "8–15" },
    ],
  },
  {
    eyebrow: "Create",
    title: "Send a photo.\nGet an ad back.",
    body:
      "Photograph what you sell. It reads the picture, writes the concept, the headline, the copy and the call to action — then rewrites all of it as many times as you like, free, until it is right.",
    demo: true,
  },
  {
    eyebrow: "Launch",
    title: "Straight into\nyour ad account.",
    body:
      "Approved campaigns are created in your own Meta ad account through the Marketing API. Always paused. Nothing spends a penny until you switch it on yourself.",
    panel: "Campaigns",
    table: true,
  },
  {
    eyebrow: "Watch",
    title: "Results, without\nopening Ads Manager.",
    body:
      "Spend, impressions, clicks, cost per click — read live from your account and shown in one place. Ask the AI about any of it and it answers in words rather than charts.",
    panel: "Results",
    metrics: [
      { k: "Spend", v: "$312.40" },
      { k: "Impressions", v: "18,204" },
      { k: "Clicks", v: "241" },
    ],
  },
];

export default function Home() {
  return (
    // No background colour on this wrapper. It is positioned with z-index auto,
    // so it paints in the root stacking context AFTER negative-z-index children
    // — an opaque background here covers the starfield and every nebula
    // completely, which is exactly what it did. The black comes from <body> and
    // from the star canvas itself.
    <div className="relative min-h-screen text-white">
      {/* Sits above everything below when it plays, and renders nothing at all
          otherwise. The page underneath is fully loaded and working the whole
          time — closing the intro is a state change, not a navigation. */}
      <CinematicIntro />

      {/* The galaxy the whole page lives inside. Fixed, never unmounted, and
          driven by scroll — moving down the page flies the camera through it
          rather than sliding a picture upwards. Falls back to a still 4K
          render of the same galaxy where WebGL2 is unavailable or motion is
          not wanted. */}
      <GalaxyBackground />
      <Grain />
      <SiteNav />

      {/* ── Hero ─────────────────────────────────────────────────────── */}
      <section className="relative flex min-h-[92vh] flex-col justify-center px-6 sm:px-10">
        <div className="mx-auto w-full max-w-[1500px] pt-28">
          <Reveal duration={1.4}>
            <p className="text-[11px] uppercase tracking-[0.42em] text-neutral-500">
              Meta advertising, run by AI
            </p>
          </Reveal>

          <h1
            className="mt-10 font-light leading-[0.86] tracking-[-0.04em] text-white"
            style={{ fontSize: "clamp(64px, 12vw, 190px)" }}
          >
            <TextReveal>MAIRO</TextReveal>
          </h1>

          <div
            className="mt-8 font-light leading-[0.95] tracking-[-0.03em]"
            style={{ fontSize: "clamp(30px, 5.2vw, 76px)" }}
          >
            <TextReveal delay={0.12} className="text-neutral-300">
              Advertising,
            </TextReveal>
            <TextReveal delay={0.22} className="text-neutral-600">
              without the expert.
            </TextReveal>
          </div>

          <Reveal delay={0.4} className="mt-14 max-w-xl">
            <p className="text-base leading-relaxed text-neutral-400 sm:text-lg">
              You set the goal and the budget. MAIRO writes the plan, makes the creative
              from your own photos, and runs the campaigns in your Meta ad account.
            </p>
          </Reveal>

          <Reveal delay={0.55} className="mt-14 flex flex-wrap items-center gap-5">
            <Magnetic>
              <Link
                href="/sign-up"
                className="group inline-flex items-center gap-3 rounded-full bg-white px-9 py-4 text-xs uppercase tracking-[0.16em] text-black transition hover:bg-neutral-200"
              >
                Try MAIRO
                <span className="transition group-hover:translate-x-1">→</span>
              </Link>
            </Magnetic>
            <a
              href="#capabilities"
              className="inline-flex items-center gap-3 rounded-full border border-white/20 px-9 py-4 text-xs uppercase tracking-[0.16em] text-neutral-300 transition hover:border-white/50 hover:text-white"
            >
              Discover MAIRO
            </a>
          </Reveal>
        </div>

        <div className="pointer-events-none absolute bottom-12 left-1/2 hidden -translate-x-1/2 sm:block">
          <div className="h-14 w-px bg-gradient-to-b from-transparent via-white/25 to-transparent" />
        </div>
      </section>

      {/* ── The thesis, in as few words as possible ──────────────────── */}
      <section className="relative px-6 py-56 sm:px-10 sm:py-72">
        <div className="mx-auto max-w-[1500px]">
          <h2
            className="font-light leading-[0.92] tracking-[-0.035em]"
            style={{ fontSize: "clamp(38px, 7vw, 116px)" }}
          >
            <TextReveal>One intelligence.</TextReveal>
            <TextReveal delay={0.1} className="text-neutral-600">
              The whole campaign.
            </TextReveal>
          </h2>

          <Reveal delay={0.3} className="mt-20 max-w-2xl">
            <p className="text-lg leading-relaxed text-neutral-400">
              Most small businesses never advertise on Facebook or Instagram, and it
              isn&apos;t because they don&apos;t want the customers. It&apos;s because Ads
              Manager was built for people who do this professionally.
            </p>
            <p className="mt-7 text-lg leading-relaxed text-neutral-400">
              MAIRO does that part. You describe the business you already know better than
              anyone. Everything after that — the strategy, the creative, the campaigns,
              the reporting — is the AI&apos;s job.
            </p>
          </Reveal>
        </div>
      </section>

      {/* ── Capabilities: each one its own scene ─────────────────────── */}
      <section id="capabilities" className="relative">
        {capabilities.map((c, i) => (
          <div key={c.eyebrow} className="px-6 py-40 sm:px-10 sm:py-56">
            <div
              className={`mx-auto grid max-w-[1500px] items-center gap-16 lg:grid-cols-2 lg:gap-28 ${
                i % 2 === 1 ? "lg:[&>*:first-child]:order-2" : ""
              }`}
            >
              <div>
                <Reveal>
                  <p className="text-[11px] uppercase tracking-[0.42em] text-neutral-500">
                    {c.eyebrow}
                  </p>
                </Reveal>
                <h3
                  className="mt-8 whitespace-pre-line font-light leading-[0.94] tracking-[-0.03em]"
                  style={{ fontSize: "clamp(34px, 5.4vw, 82px)" }}
                >
                  <TextReveal>{c.title}</TextReveal>
                </h3>
                <Reveal delay={0.2} className="mt-10 max-w-md">
                  <p className="leading-relaxed text-neutral-400">{c.body}</p>
                </Reveal>
              </div>

              <Reveal delay={0.15} y={48} duration={1.2}>
                {c.demo ? (
                  <ConceptDemo />
                ) : (
                  <SpacePanel label={c.panel}>
                    {c.lines && (
                      <div className="space-y-6">
                        {c.lines.map((l, n) => (
                          <div key={n}>
                            <p className="mb-2 text-[10px] uppercase tracking-[0.18em] text-neutral-600">
                              {l.who === "you" ? "You" : "Strategist"}
                            </p>
                            <p
                              className={`text-sm leading-relaxed ${
                                l.who === "you" ? "text-neutral-400" : "text-neutral-200"
                              }`}
                            >
                              {l.text}
                            </p>
                          </div>
                        ))}
                      </div>
                    )}

                    {c.metrics && (
                      <div className="grid gap-6 sm:grid-cols-3">
                        {c.metrics.map((m) => (
                          <div key={m.k}>
                            <p className="text-[10px] uppercase tracking-[0.16em] text-neutral-600">
                              {m.k}
                            </p>
                            <p className="mt-2 text-2xl font-light tabular-nums text-white">
                              {m.v}
                            </p>
                          </div>
                        ))}
                      </div>
                    )}

                    {c.table && (
                      <div className="space-y-4 text-sm">
                        <div className="flex items-center justify-between gap-4 border-b border-white/[0.07] pb-4">
                          <span className="text-neutral-300">Lead Gen · September</span>
                          <span className="rounded-full border border-amber-400/25 px-3 py-1 text-[10px] uppercase tracking-[0.14em] text-amber-300/90">
                            Paused
                          </span>
                        </div>
                        <div className="flex justify-between text-neutral-500">
                          <span>Daily budget</span>
                          <span className="tabular-nums text-neutral-300">$17.00</span>
                        </div>
                        <div className="flex justify-between text-neutral-500">
                          <span>On Meta</span>
                          <span className="text-emerald-300/90">Yes</span>
                        </div>
                        <p className="pt-3 text-xs leading-relaxed text-neutral-600">
                          Created in your ad account, paused. Nothing spends until you say so.
                        </p>
                      </div>
                    )}
                  </SpacePanel>
                )}
              </Reveal>
            </div>
          </div>
        ))}
      </section>

      {/* ── Pricing ──────────────────────────────────────────────────── */}
      <section id="pricing" className="relative px-6 py-40 sm:px-10 sm:py-56">
        <div className="mx-auto max-w-[1500px]">
          <h2
            className="font-light leading-[0.94] tracking-[-0.03em]"
            style={{ fontSize: "clamp(34px, 5.4vw, 82px)" }}
          >
            <TextReveal>Pick a scale.</TextReveal>
          </h2>
          <Reveal delay={0.2} className="mt-8 max-w-lg">
            <p className="leading-relaxed text-neutral-400">
              The same intelligence on every plan. What changes is how much of it runs for
              you each month. Cancel whenever.
            </p>
          </Reveal>

          <div className="mt-24 grid gap-px overflow-hidden rounded-2xl border border-white/[0.08] bg-white/[0.06] lg:grid-cols-3">
            {PLANS.map((plan, i) => (
              <Reveal key={plan.tier} delay={i * 0.1}>
                <div className="flex h-full flex-col bg-black/60 p-10">
                  <p className="text-[11px] uppercase tracking-[0.28em] text-neutral-500">
                    {plan.name}
                  </p>
                  <p className="mt-8 text-5xl font-light tabular-nums tracking-tight">
                    ${plan.priceMonthly}
                    <span className="ml-1 text-sm text-neutral-600">/mo</span>
                  </p>
                  <p className="mt-5 text-sm leading-relaxed text-neutral-500">
                    {plan.tagline}
                  </p>
                  <ul className="mt-10 flex-1 space-y-3.5 text-sm text-neutral-400">
                    {plan.features.map((f) => (
                      <li key={f} className="flex gap-3">
                        <span className="mt-[9px] h-px w-3 shrink-0 bg-neutral-700" />
                        {f}
                      </li>
                    ))}
                  </ul>
                  <Link
                    href="/sign-up"
                    className="mt-12 inline-flex justify-center rounded-full border border-white/20 px-6 py-3.5 text-xs uppercase tracking-[0.16em] text-neutral-300 transition hover:border-white hover:bg-white hover:text-black"
                  >
                    Start with {plan.name}
                  </Link>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ── For the people this could have replaced ───────────────────── */}
      <section id="freelancers" className="relative px-6 py-40 sm:px-10 sm:py-56">
        <div className="mx-auto max-w-[1500px]">
          <Reveal>
            <p className="text-[11px] uppercase tracking-[0.42em] text-neutral-500">
              For freelancers and studios
            </p>
          </Reveal>

          <h2
            className="mt-8 font-light leading-[0.94] tracking-[-0.03em]"
            style={{ fontSize: "clamp(34px, 5.4vw, 82px)" }}
          >
            <TextReveal>Run it for</TextReveal>
            <TextReveal delay={0.1} className="text-neutral-600">
              everyone else.
            </TextReveal>
          </h2>

          <div className="mt-16 grid gap-16 lg:grid-cols-2 lg:gap-28">
            <Reveal delay={0.2}>
              <p className="max-w-md leading-relaxed text-neutral-400">
                If running ads is what you do for a living, MAIRO is not competing
                with you — it is the thing you run. One login, every business you
                work with, each with its own ad account, its own campaigns and its
                own creatives.
              </p>
              <p className="mt-7 max-w-md leading-relaxed text-neutral-400">
                Take on the clients whose budgets never justified your hourly rate.
                Do the strategy and the relationship; let MAIRO do the building.
              </p>
              <Magnetic>
                <Link
                  href="/for-freelancers"
                  className="group mt-12 inline-flex items-center gap-3 rounded-full border border-white/20 px-9 py-4 text-xs uppercase tracking-[0.16em] text-neutral-200 transition hover:border-white hover:bg-white hover:text-black"
                >
                  Set up a studio
                  <span className="transition group-hover:translate-x-1">→</span>
                </Link>
              </Magnetic>
            </Reveal>

            <Reveal delay={0.3} y={48} duration={1.2}>
              <div className="grid gap-px overflow-hidden rounded-2xl border border-white/[0.08] bg-white/[0.06] sm:grid-cols-2">
                {FREELANCER_PLANS.map((plan) => (
                  <div key={plan.tier} className="flex h-full flex-col bg-black/60 p-8">
                    <p className="text-[11px] uppercase tracking-[0.28em] text-neutral-500">
                      {plan.name}
                    </p>
                    <p className="mt-6 text-4xl font-light tabular-nums tracking-tight">
                      ${plan.priceMonthly}
                      <span className="ml-1 text-sm text-neutral-600">/mo</span>
                    </p>
                    <p className="mt-4 text-xs leading-relaxed text-neutral-500">
                      {plan.spendGuidance}
                    </p>
                    <ul className="mt-8 flex-1 space-y-3 text-sm text-neutral-400">
                      {plan.features.slice(0, 4).map((f) => (
                        <li key={f} className="flex gap-3">
                          <span className="mt-[9px] h-px w-3 shrink-0 bg-neutral-700" />
                          {f}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </Reveal>
          </div>
        </div>
      </section>

      {/* ── Final call ───────────────────────────────────────────────── */}
      <section className="relative flex min-h-[85vh] items-center justify-center px-6 text-center sm:px-10">
        <div className="mx-auto max-w-4xl">
          <h2
            className="font-light leading-[0.9] tracking-[-0.04em]"
            style={{ fontSize: "clamp(52px, 10vw, 150px)" }}
          >
            <TextReveal>Meet MAIRO.</TextReveal>
          </h2>
          <Reveal delay={0.25} className="mt-12">
            <p className="text-lg leading-relaxed text-neutral-400 sm:text-xl">
              Your business. Your budget. Campaigns that run themselves.
            </p>
          </Reveal>
          <Reveal delay={0.4} className="mt-16 flex justify-center">
            <Magnetic>
              <Link
                href="/sign-up"
                className="group inline-flex items-center gap-3 rounded-full bg-white px-11 py-5 text-xs uppercase tracking-[0.16em] text-black transition hover:bg-neutral-200"
              >
                Start with MAIRO
                <span className="transition group-hover:translate-x-1">→</span>
              </Link>
            </Magnetic>
          </Reveal>
        </div>
      </section>

      {/* ── Footer ───────────────────────────────────────────────────── */}
      {/* Fades into the sky rather than sitting on it. A flat panel with a top
          border drew a hard horizontal line straight across the starfield,
          which is the one thing this page is trying not to do. */}
      <footer className="relative bg-gradient-to-b from-transparent via-black/75 to-black px-6 pb-16 pt-40 sm:px-10">
        <div className="mx-auto max-w-[1500px]">
          <p
            className="font-light leading-none tracking-[-0.04em] text-white/[0.09]"
            style={{ fontSize: "clamp(72px, 19vw, 300px)" }}
          >
            MAIRO
          </p>
          <div className="mt-20 flex flex-col gap-6 text-xs tracking-wide text-neutral-600 sm:flex-row sm:items-center sm:justify-between">
            <span>© {new Date().getFullYear()} MAIRO</span>
            <div className="flex flex-wrap gap-x-8 gap-y-3">
              <ReplayIntroLink className="transition hover:text-neutral-300" />
              <Link href="/for-freelancers" className="transition hover:text-neutral-300">For freelancers</Link>
              <Link href="/privacy" className="transition hover:text-neutral-300">Privacy</Link>
              <Link href="/terms" className="transition hover:text-neutral-300">Terms</Link>
              <Link href="/data-deletion" className="transition hover:text-neutral-300">Data deletion</Link>
              <Link href="/sign-in" className="transition hover:text-neutral-300">Sign in</Link>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
