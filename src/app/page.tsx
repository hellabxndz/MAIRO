import Link from "next/link";
import { Grain } from "@/components/grain";
import { Aurora } from "@/components/aurora";
import { Marquee } from "@/components/marquee";
import { Faq } from "@/components/faq";
import { ConceptDemo } from "@/components/concept-demo";
import { SiteNav } from "@/components/site-nav";
import { HeroParallaxBg } from "@/components/hero-parallax-bg";
import { Reveal } from "@/components/reveal";
import { TextReveal } from "@/components/text-reveal";
import { Magnetic } from "@/components/magnetic";
import { PLANS } from "@/lib/plans";

const steps = [
  {
    title: "Tell the AI your goal",
    body: "Leads, sales, awareness, or traffic — and your monthly budget. Two minutes, in plain English. No ad settings to configure.",
  },
  {
    title: "The AI writes your plan",
    body: "It builds the month's campaigns, splits your budget across them, and lays out a creative calendar. You just approve it.",
  },
  {
    title: "Ask it for the creative",
    body: "Tell the AI what you want an ad to say and it writes the copy and builds the creative for you — as many versions as you need.",
  },
  {
    title: "The AI runs the campaigns",
    body: "It launches straight to your Meta ad account and keeps them running. You watch results in one dashboard and ask questions any time.",
  },
];

const agents = [
  {
    name: "Strategist",
    desc: "Plans budget, targeting, and monthly goals with you.",
    asks: "\u201cShould I put more into retargeting this month?\u201d",
  },
  {
    name: "Creative",
    desc: "Writes the ad copy and builds the creative from your own photos.",
    asks: "\u201cMake this one feel more premium.\u201d",
  },
  {
    name: "Support",
    desc: "Answers questions about your account, billing, and performance.",
    asks: "\u201cWhy did my cost per click go up?\u201d",
  },
];

const marqueeItems = [
  "No ad manager to learn",
  "Campaigns built for you",
  "Creative from your own photos",
  "Budget split automatically",
  "Every ad policy-checked",
  "Cancel any time",
];

const proof = [
  { figure: "2 min", label: "to set your goal and budget" },
  { figure: "$5/day", label: "is enough to start" },
  { figure: "0", label: "ad settings you have to touch" },
  { figure: "24/7", label: "specialists you can message" },
];

const faqs = [
  {
    q: "Do I need to know anything about Meta ads?",
    a: "No. That is the entire point. You tell MAIRO your goal and your monthly budget in plain English, and it builds the campaigns, writes the ads, and runs them. There is no ad manager for you to learn and no settings for you to configure.",
  },
  {
    q: "Whose ad account do the ads run on?",
    a: "Yours. You connect your own Meta ad account and MAIRO works inside it. You can see everything in Meta Ads Manager, and you can revoke access whenever you like. Your ad spend goes to Meta directly, never through us.",
  },
  {
    q: "What if I do not like what the AI writes?",
    a: "Tell it what to change and it rewrites, as many times as you want. Reworking a concept is free and never uses up one of your monthly creative requests \u2014 you only spend those on new ideas, not on corrections.",
  },
  {
    q: "Can it use my own product photos?",
    a: "Yes, and it works best that way. Upload a photo of what you sell, and the AI builds the ad around what it can actually see in it, rather than inventing something generic.",
  },
  {
    q: "Is anything checked before it runs?",
    a: "Every ad is reviewed against Meta\u2019s advertising policies before it can go live. Ads that would put your account at risk are stopped and explained, in plain language, rather than quietly failing later.",
  },
  {
    q: "What happens if I cancel?",
    a: "The campaigns stay in your Meta ad account, because they were always yours. Nothing is deleted or taken back. You can pause them, keep running them, or hand them to someone else.",
  },
];


export default function Home() {
  return (
    <div className="relative flex-1">
      <Aurora />
      <Grain />
      <SiteNav />

      {/* Hero */}
      <section className="relative flex min-h-screen flex-col justify-center overflow-hidden px-6 sm:px-10">
        <HeroParallaxBg />
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/30 via-transparent to-[#030209]" />

        <div className="pointer-events-none relative mx-auto w-full max-w-[1400px] pt-24">
          <Reveal duration={0.8} className="pointer-events-none">
            <p className="text-xs uppercase tracking-[0.25em] text-neutral-500">
              AI-run ad management
            </p>
          </Reveal>

          <h1
            className="pointer-events-none mt-8 font-medium leading-[0.95] text-white"
            style={{ fontSize: "clamp(3rem, 9vw, 8.5rem)" }}
          >
            <TextReveal>Run winning</TextReveal>
            <TextReveal delay={0.1} className="text-neutral-500">
              Meta ads.
            </TextReveal>
          </h1>

          <Reveal delay={0.25} className="pointer-events-none mt-8 max-w-xl">
            <p className="text-lg leading-snug text-neutral-300">
              Without having to learn how. You set the goal and budget — our AI plans,
              creates, and runs the campaigns for you.
            </p>
          </Reveal>

          <div className="pointer-events-none mt-10 flex flex-col items-start gap-10 sm:flex-row sm:items-end sm:justify-between">
            <Reveal delay={0.4} className="pointer-events-none max-w-sm">
              <p className="text-sm leading-relaxed text-neutral-400">
                MAIRO is the ad platform for business owners who&apos;d rather not become
                an ads expert. No campaigns to configure, no jargon to learn — just a
                monthly plan that runs itself.
              </p>
            </Reveal>

            <Reveal delay={0.5} className="pointer-events-auto flex items-center gap-8">
              <Magnetic>
                <Link
                  href="/sign-up"
                  className="group flex items-center gap-3 border border-white/25 px-7 py-4 text-xs uppercase tracking-[0.15em] text-white transition hover:border-white hover:bg-white hover:text-black"
                >
                  Start your plan
                  <span className="transition group-hover:translate-x-1">→</span>
                </Link>
              </Magnetic>
              <a
                href="#how-it-works"
                className="group text-xs uppercase tracking-[0.15em] text-neutral-400 transition hover:text-white"
              >
                How it works
                <span className="ml-2 inline-block transition group-hover:translate-y-0.5">↓</span>
              </a>
            </Reveal>
          </div>
        </div>

        <p className="pointer-events-none absolute bottom-24 right-6 hidden text-xs uppercase tracking-[0.2em] text-neutral-600 sm:block sm:right-10">
          move your cursor to interact
        </p>

        <div className="pointer-events-none absolute bottom-10 left-1/2 hidden -translate-x-1/2 sm:block">
          <div className="h-10 w-px bg-gradient-to-b from-transparent via-white/30 to-transparent" />
        </div>
      </section>

      <Marquee items={marqueeItems} />

      {/* How it works — heading stays put while the steps scroll past it */}
      <section id="how-it-works" className="relative border-t border-white/10 px-6 py-32 sm:px-10 sm:py-48">
        <div className="mx-auto grid max-w-[1400px] gap-16 lg:grid-cols-[0.8fr_1.4fr] lg:gap-24">
          <div className="lg:sticky lg:top-32 lg:self-start">
            <Reveal>
              <p className="text-xs uppercase tracking-[0.2em] text-neutral-500">Process</p>
            </Reveal>
            <Reveal delay={0.1}>
              <h2 className="mt-6 text-4xl font-medium leading-[1.05] text-white sm:text-5xl">
                You ask.
                <br />
                The AI runs it.
              </h2>
            </Reveal>
          </div>

          <div className="flex flex-col">
            {steps.map((step, i) => (
              <Reveal key={step.title} delay={i * 0.05}>
                <div className="flex flex-col gap-4 border-t border-white/10 py-12 sm:flex-row sm:gap-12">
                  <span className="text-sm text-neutral-600">{String(i + 1).padStart(2, "0")}</span>
                  <div className="max-w-md">
                    <h3 className="text-2xl font-medium text-white sm:text-3xl">{step.title}</h3>
                    <p className="mt-4 text-sm leading-relaxed text-neutral-400">{step.body}</p>
                  </div>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* Show the thing rather than describe it — the output is the pitch */}
      <section className="border-t border-white/10 px-6 py-32 sm:px-10 sm:py-40">
        <div className="mx-auto grid max-w-[1400px] items-center gap-16 lg:grid-cols-2 lg:gap-24">
          <div>
            <Reveal>
              <p className="text-xs uppercase tracking-[0.2em] text-neutral-500">Live</p>
            </Reveal>
            <Reveal delay={0.1}>
              <h2 className="mt-6 text-4xl font-medium leading-[1.05] text-white sm:text-5xl">
                This is what
                <br />
                it hands you.
              </h2>
            </Reveal>
            <Reveal delay={0.2}>
              <p className="mt-6 max-w-md text-sm leading-relaxed text-neutral-400">
                Upload a photo of what you sell and say what you want the ad to do. You get
                back a finished concept — the idea, the headline, the copy, and the right
                button — not a form to fill in.
              </p>
            </Reveal>
            <Reveal delay={0.3}>
              <p className="mt-6 max-w-md text-sm leading-relaxed text-neutral-500">
                Don&apos;t like it? Tell it what to change and it rewrites. That part is free
                and unlimited.
              </p>
            </Reveal>
          </div>

          <Reveal delay={0.15}>
            <ConceptDemo />
          </Reveal>
        </div>
      </section>

      {/* Numbers band — the shape of the offer at a glance */}
      <section className="border-t border-white/10 px-6 py-20 sm:px-10">
        <div className="mx-auto grid max-w-[1400px] gap-10 sm:grid-cols-2 lg:grid-cols-4">
          {proof.map((item, i) => (
            <Reveal key={item.label} delay={i * 0.06}>
              <div className="border-l border-white/15 pl-5">
                <p className="text-4xl font-medium text-white sm:text-5xl">{item.figure}</p>
                <p className="mt-2 text-sm leading-snug text-neutral-500">{item.label}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* AI specialists — editorial rows that open up on hover */}
      <section id="agents" className="border-t border-white/10 px-6 py-32 sm:px-10 sm:py-48">
        <div className="mx-auto max-w-[1400px]">
          <Reveal>
            <p className="text-xs uppercase tracking-[0.2em] text-neutral-500">Team</p>
          </Reveal>
          <Reveal delay={0.1}>
            <h2 className="mt-6 max-w-2xl text-4xl font-medium leading-[1.05] text-white sm:text-5xl">
              AI specialists, on call.
            </h2>
          </Reveal>
          <Reveal delay={0.15}>
            <p className="mt-6 max-w-lg text-sm leading-relaxed text-neutral-400">
              Three of them, inside your dashboard. Message them the way you&apos;d message
              someone who runs ads for a living — because that&apos;s the job they&apos;re doing.
            </p>
          </Reveal>

          <div className="mt-20 border-t border-white/10">
            {agents.map((agent, i) => (
              <Reveal key={agent.name} delay={i * 0.06}>
                <div className="group relative overflow-hidden border-b border-white/10 py-10">
                  {/* A wash that sweeps in from the left on hover. Transform and
                      opacity only, so it never costs a layout. */}
                  <div className="pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-violet-500/10 via-violet-500/[0.04] to-transparent transition-transform duration-500 group-hover:translate-x-0" />
                  <div className="relative flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
                    <div className="flex items-baseline gap-5">
                      <span className="text-xs text-neutral-700">0{i + 1}</span>
                      <h3 className="text-3xl font-medium text-white transition duration-300 group-hover:translate-x-2 sm:text-4xl">
                        {agent.name}
                      </h3>
                    </div>
                    <div className="max-w-sm sm:text-right">
                      <p className="text-sm leading-relaxed text-neutral-400">{agent.desc}</p>
                      <p className="mt-2 text-sm italic text-violet-300/70">{agent.asks}</p>
                    </div>
                  </div>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing — rendered from src/lib/plans.ts, the same config the server
          actions enforce limits from, so the page can't promise what the app
          won't allow */}
      <section id="pricing" className="border-t border-white/10 px-6 py-32 sm:px-10 sm:py-48">
        <div className="mx-auto max-w-[1400px]">
          <Reveal>
            <p className="text-xs uppercase tracking-[0.2em] text-neutral-500">Pricing</p>
          </Reveal>
          <Reveal delay={0.1}>
            <h2 className="mt-6 max-w-2xl text-4xl font-medium leading-[1.05] text-white sm:text-5xl">
              Pick how much of this
              <br />
              you want off your plate.
            </h2>
          </Reveal>
          <Reveal delay={0.15}>
            <p className="mt-6 max-w-xl text-sm leading-relaxed text-neutral-400">
              Every plan runs on the same AI. What changes is how much of it runs for you —
              more campaigns, more creative made each month, and a human strategist as you
              scale up.
            </p>
          </Reveal>

          <div className="mt-16 grid gap-6 lg:grid-cols-3">
            {PLANS.map((plan, i) => (
              <Reveal key={plan.name} delay={i * 0.08}>
                <div
                  className={`flex h-full flex-col border p-8 ${
                    plan.featured
                      ? "border-white/40 bg-white/[0.03]"
                      : "border-white/10"
                  }`}
                >
                  {plan.featured && (
                    <span className="mb-6 inline-block w-fit border border-white/30 px-3 py-1 text-[10px] uppercase tracking-[0.15em] text-neutral-300">
                      Most businesses choose this
                    </span>
                  )}
                  <h3 className="text-2xl font-medium text-white">{plan.name}</h3>
                  <p className="mt-2 text-sm text-neutral-500">{plan.tagline}</p>
                  <p className="mt-8 text-4xl font-medium text-white">
                    ${plan.priceMonthly}
                    <span className="text-base font-normal text-neutral-500">/mo</span>
                  </p>
                  <p className="mt-3 text-xs uppercase tracking-[0.1em] text-neutral-600">
                    {plan.spendGuidance}
                  </p>

                  <ul className="mt-8 flex flex-1 flex-col gap-3 border-t border-white/10 pt-8">
                    {plan.features.map((feature) => (
                      <li key={feature} className="flex items-start gap-3 text-sm text-neutral-300">
                        <span className="mt-1 text-neutral-600">—</span>
                        {feature}
                      </li>
                    ))}
                  </ul>

                  <Magnetic className="mt-10">
                    <Link
                      href="/sign-up"
                      className={`group flex items-center justify-center gap-3 border px-6 py-3 text-xs uppercase tracking-[0.15em] transition ${
                        plan.featured
                          ? "border-white bg-white text-black hover:bg-neutral-200"
                          : "border-white/25 text-white hover:border-white hover:bg-white hover:text-black"
                      }`}
                    >
                      Start with {plan.name}
                      <span className="transition group-hover:translate-x-1">→</span>
                    </Link>
                  </Magnetic>
                </div>
              </Reveal>
            ))}
          </div>

          <Reveal delay={0.3} className="mt-10 max-w-2xl space-y-4 text-sm leading-relaxed text-neutral-500">
            <p>
              A freelancer runs $500–1,500 a month and most agencies won&apos;t take you at
              all under $2,000 in monthly spend. Starter exists because a business putting
              $5 a day into ads still deserves someone running them properly.
            </p>
            <p>
              Moving up a plan gets cheaper per campaign, not more expensive: Starter is
              roughly 19% of a $150 ad budget, Scale is closer to 4% of a $5,000 one — and
              that&apos;s where the human review and the faster creative turnaround kick in.
            </p>
          </Reveal>
        </div>
      </section>

      {/* Questions people actually ask before handing over an ad account */}
      <section className="border-t border-white/10 px-6 py-32 sm:px-10 sm:py-40">
        <div className="mx-auto grid max-w-[1400px] gap-14 lg:grid-cols-[0.7fr_1.3fr] lg:gap-24">
          <div className="lg:sticky lg:top-32 lg:self-start">
            <Reveal>
              <p className="text-xs uppercase tracking-[0.2em] text-neutral-500">Questions</p>
            </Reveal>
            <Reveal delay={0.1}>
              <h2 className="mt-6 text-4xl font-medium leading-[1.05] text-white sm:text-5xl">
                Before you
                <br />
                hand it over.
              </h2>
            </Reveal>
          </div>
          <Reveal delay={0.15}>
            <Faq items={faqs} />
          </Reveal>
        </div>
      </section>

      {/* Final CTA */}
      <section className="relative flex min-h-[70vh] flex-col items-center justify-center border-t border-white/10 px-6 text-center sm:px-10">
        <Reveal>
          <p className="text-xs uppercase tracking-[0.2em] text-neutral-500">Get started</p>
        </Reveal>
        <Reveal delay={0.1}>
          <h2 className="mt-6 text-5xl font-medium leading-[1.02] text-white sm:text-7xl md:text-8xl">
            Ready to hand
            <br />off your ads?
          </h2>
        </Reveal>
        <Reveal delay={0.25} className="mt-8 max-w-md">
          <p className="text-sm leading-relaxed text-neutral-400">
            Set your goal and budget today — your first monthly plan is ready in minutes.
          </p>
        </Reveal>
        <Reveal delay={0.35} className="mt-10">
          <Magnetic>
            <Link
              href="/sign-up"
              className="group flex items-center gap-3 border border-white/25 px-8 py-4 text-xs uppercase tracking-[0.15em] text-white transition hover:border-white hover:bg-white hover:text-black"
            >
              Create your account
              <span className="transition group-hover:translate-x-1">→</span>
            </Link>
          </Magnetic>
        </Reveal>
      </section>

      <footer className="border-t border-white/10 px-6 py-10 sm:px-10">
        <div className="mx-auto flex max-w-[1400px] flex-col items-center justify-between gap-4 text-xs tracking-wide text-neutral-600 sm:flex-row">
          <span>© {new Date().getFullYear()} MAIRO</span>
          <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2">
            <Link href="/privacy" className="transition hover:text-neutral-300">Privacy</Link>
            <Link href="/terms" className="transition hover:text-neutral-300">Terms</Link>
            <Link href="/data-deletion" className="transition hover:text-neutral-300">Data deletion</Link>
          </div>
          <span>Meta ads, run by AI.</span>
        </div>
      </footer>
    </div>
  );
}
