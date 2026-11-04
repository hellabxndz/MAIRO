import Link from "next/link";
import { SiteFooter } from "@/components/landing/site-footer";
import { LandingBeacon } from "@/components/landing/landing-beacon";
import { RevealOnScroll } from "@/components/landing/console-sections";
import { USABLE_TOOLS } from "@/lib/tools/registry";
import { PLANS } from "@/lib/plans";
import { brandFont } from "@/lib/fonts";
import { CinematicBackdrop } from "@/components/cinematic/home/director";
import { CinematicHero } from "@/components/cinematic/home/hero";
import { HomeNav } from "@/components/cinematic/home/nav";
import { Closing, ControlBand, ExampleRun, HowItWorks, PricingSimple } from "@/components/cinematic/home/scenes";
import { AskMairoScene } from "@/components/cinematic/home/conversation";
import { MobileCta, ScrollProgress } from "@/components/cinematic/home/live";

// The homepage, v3 "Signal" (docs/DESIGN-SPEC-v3.md §7). Six things, once each:
//
//   1. The hero: "Your ads, handled" and the business's website, straight
//      into the free plan.
//   2. The Field — MAIRO's one form — behind the page.
//   3. How it works: Analyze, Create, Track.
//   4. One MAIRO, shown: a conversation where it answers from figures and
//      prepares a change for approval; then one example — a sentence in, an
//      ad and its 30 days out. Both a fictional business, labelled as such.
//      Then what stays in the owner's hands (ControlBand).
//   5. Two plans, from lib/plans only.
//   6. The closing line and the website box again.
//
// Trust, security, legal, help and solutions stay one tap away (the footer
// and "Built for"). Rules above the design: no invented customers, reviews,
// counts, results or integrations; every figure shown is sample data for a
// fictional business and says so; the free plan is free, and a subscription
// is only for building and running real campaigns, each of which waits for
// the owner's approval. The page reads the same without WebGL, without
// script and under reduced motion.

const SOLUTIONS = [
  { href: "/solutions/local-services", label: "Local services" },
  { href: "/solutions/appointments", label: "Appointments" },
  { href: "/solutions/online-stores", label: "Online stores" },
];

export function ConsoleHome() {
  const toolsLive = USABLE_TOOLS().length > 0;
  const plans = PLANS.filter((p) => !p.legacy)
    .slice(0, 2)
    .map((p) => ({ tier: p.tier, name: p.name, price: `$${p.priceMonthly.toFixed(2)}`, line: p.tagline, features: p.features.slice(0, 5) }));
  return (
    <div className={`${brandFont.className} relative isolate min-h-screen overflow-x-clip bg-[color:var(--v3-ink)] text-white`}>
      <CinematicBackdrop />
      <RevealOnScroll />
      <ScrollProgress />
      <HomeNav />
      <main className="relative z-10">
        <CinematicHero />
        <HowItWorks />
        <AskMairoScene />
        <ExampleRun />
        <ControlBand />
        <PricingSimple plans={plans} />
        <Closing />
        <nav aria-label="Built for" className="mx-auto flex w-full max-w-[1320px] flex-wrap items-center gap-x-6 gap-y-2 px-5 pb-16 sm:px-10 lg:px-16">
          <span className="v3-label">Built for</span>
          {SOLUTIONS.map((s) => (
            <Link key={s.href} href={s.href} className="inline-flex min-h-11 items-center text-[14.5px] text-white/75 hover:text-white">
              {s.label}
            </Link>
          ))}
        </nav>
      </main>
      <MobileCta />
      <SiteFooter toolsLive={toolsLive} />
      <LandingBeacon variant="story" />
    </div>
  );
}
