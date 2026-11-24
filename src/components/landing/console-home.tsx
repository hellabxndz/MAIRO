import Link from "next/link";
import { SiteFooter } from "@/components/landing/site-footer";
import { LandingBeacon } from "@/components/landing/landing-beacon";
import { RevealOnScroll } from "@/components/landing/console-sections";
import { USABLE_TOOLS } from "@/lib/tools/registry";
import { PLANS, trialDaysFor } from "@/lib/plans";
import { DEFAULT_ENTITLEMENTS } from "@/lib/entitlements";
import { brandFont } from "@/lib/fonts";
import { CinematicBackdrop } from "@/components/cinematic/home/director";
import { CinematicHero } from "@/components/cinematic/home/hero";
import { HomeNav } from "@/components/cinematic/home/nav";
import { Closing, ControlBand, ExampleRun, HowItWorks, PracticalFaq, PricingSimple, TheWork, VersusAgency } from "@/components/cinematic/home/scenes";
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
  // The two plans as they're enforced: prices from lib/plans, allowances
  // from the entitlement table the server checks — so the comparison can't
  // promise more than the product gives.
  const plans = PLANS.filter((p) => !p.legacy)
    .slice(0, 2)
    .map((p) => {
      const e = DEFAULT_ENTITLEMENTS[p.tier];
      const trial = trialDaysFor(p.tier);
      return {
        tier: p.tier,
        name: p.name,
        price: `$${p.priceMonthly.toFixed(2)}`,
        line: p.spendGuidance,
        start: trial ? `${trial}-day free trial, then monthly` : "Billed monthly from the day you start",
        rows: [
          ["Meta ad accounts", e.ad_account_limit === 1 ? "1" : `Up to ${e.ad_account_limit}`],
          ["AI creative credits a month", String(e.studio_credits_monthly)],
          ["Changes to your ads", e.autopilot ? "You approve them, or let Autopilot act inside your limits" : "MAIRO recommends; you approve each one"],
          ["Team members", e.member_limit === 1 ? "Just you" : "Your team, with approval permissions"],
          ["Campaigns", Number.isFinite(p.limits.campaigns) ? `Up to ${p.limits.campaigns}` : "Unlimited"],
        ] as [string, string][],
      };
    });
  return (
    <div className={`${brandFont.className} relative isolate min-h-screen overflow-x-clip bg-[color:var(--v3-ink)] text-white`}>
      <CinematicBackdrop />
      <RevealOnScroll />
      <ScrollProgress />
      <HomeNav />
      <main className="relative z-10">
        <CinematicHero />
        <TheWork />
        <HowItWorks />
        <AskMairoScene />
        <ExampleRun />
        <ControlBand />
        <VersusAgency />
        <PricingSimple plans={plans} />
        <PracticalFaq />
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
