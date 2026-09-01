import Link from "next/link";
import { Grain } from "@/components/grain";
import { Galaxy } from "@/components/galaxy";
import { SiteNav } from "@/components/site-nav";
import { HeroParallaxBg } from "@/components/hero-parallax-bg";
import { Reveal } from "@/components/reveal";
import { TextReveal } from "@/components/text-reveal";
import { Magnetic } from "@/components/magnetic";

const steps = [
  {
    title: "Tell us your goal",
    body: "Leads, sales, awareness, or traffic — and your monthly ad budget. Takes about two minutes.",
  },
  {
    title: "We build your plan",
    body: "A real strategist and our AI plan your monthly campaigns, budget split, and creative calendar.",
  },
  {
    title: "We create and launch",
    body: "We write the ad copy, build the creative, and push live campaigns straight to your Meta ad account.",
  },
  {
    title: "You watch it work",
    body: "Track performance in one dashboard, and chat with an AI specialist anytime you have a question.",
  },
];

const agents = [
  { name: "Strategist", desc: "Plans budget, targeting, and monthly goals with you." },
  { name: "Creative", desc: "Drafts ad copy and creative briefs for your campaigns." },
  { name: "Support", desc: "Answers questions about your account, billing, and performance." },
];

const plans = [
  {
    name: "Starter",
    price: "$499",
    tagline: "Get your first campaigns live.",
    features: [
      "1 active campaign",
      "Monthly AI-generated plan",
      "Strategist + Support agent access",
      "AI-drafted ad copy",
      "Monthly performance report",
    ],
  },
  {
    name: "Growth",
    price: "$999",
    tagline: "What most businesses run on.",
    featured: true,
    features: [
      "Everything in Starter",
      "Up to 5 active campaigns",
      "Full agent team, including Creative",
      "Custom photo/video creative requests",
      "Weekly optimization checks",
      "A/B creative testing",
      "Priority support",
    ],
  },
  {
    name: "Scale",
    price: "$1,999",
    tagline: "For teams ready to spend more.",
    features: [
      "Everything in Growth",
      "Unlimited active campaigns",
      "Dedicated human strategist",
      "48-hour rush creative turnaround",
      "Advanced audience & retargeting setup",
      "Quarterly strategy calls",
    ],
  },
];

export default function Home() {
  return (
    <div className="relative flex-1">
      <Galaxy />
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

      {/* How it works — heading stays put while the steps scroll past it */}
      <section id="how-it-works" className="relative border-t border-white/10 px-6 py-32 sm:px-10 sm:py-48">
        <div className="mx-auto grid max-w-[1400px] gap-16 lg:grid-cols-[0.8fr_1.4fr] lg:gap-24">
          <div className="lg:sticky lg:top-32 lg:self-start">
            <Reveal>
              <p className="text-xs uppercase tracking-[0.2em] text-neutral-500">Process</p>
            </Reveal>
            <Reveal delay={0.1}>
              <h2 className="mt-6 text-4xl font-medium leading-[1.05] text-white sm:text-5xl">
                From zero to
                <br />a live campaign.
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

      {/* AI specialists — editorial rows, not cards */}
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

          <div className="mt-20 border-t border-white/10">
            {agents.map((agent, i) => (
              <Reveal key={agent.name} delay={i * 0.06}>
                <div className="group flex flex-col justify-between gap-4 border-b border-white/10 py-10 sm:flex-row sm:items-center">
                  <h3 className="text-3xl font-medium text-white transition duration-300 group-hover:translate-x-3 sm:text-4xl">
                    {agent.name}
                  </h3>
                  <p className="max-w-sm text-sm leading-relaxed text-neutral-400">{agent.desc}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing — the case for the higher tiers is unlimited campaigns, a
          human strategist, and faster turnaround, not just "more features" */}
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
              Every plan runs on the same AI. What changes is how much runs on autopilot —
              more campaigns, faster creative, and a real human strategist as you go up.
            </p>
          </Reveal>

          <div className="mt-16 grid gap-6 lg:grid-cols-3">
            {plans.map((plan, i) => (
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
                    {plan.price}
                    <span className="text-base font-normal text-neutral-500">/mo</span>
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

          <Reveal delay={0.3} className="mt-10 max-w-2xl text-sm leading-relaxed text-neutral-500">
            <p>
              Starter caps out at one campaign because that&apos;s about as much as manual
              oversight can keep sharp. Growth and Scale unlock more campaigns and a
              dedicated strategist — the cost per campaign actually goes down as you move
              up, and turnaround gets faster.
            </p>
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
          <span>Meta ads, run by AI.</span>
        </div>
      </footer>
    </div>
  );
}
