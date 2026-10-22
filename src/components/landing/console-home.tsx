import Link from "next/link";
import { LandingNav } from "@/components/landing/landing-nav";
import { SiteFooter } from "@/components/landing/site-footer";
import { LandingBeacon } from "@/components/landing/landing-beacon";
import { PricingBlock, TrustBlock, FaqBlock } from "@/components/landing/home";
import { ConsoleHero } from "@/components/landing/console-hero";
import { RevealOnScroll } from "@/components/landing/console-sections";
import { Walkthrough } from "@/components/home/walkthrough";
import { DashboardTour, TeamSection } from "@/components/home/product-tour";
import { CreativeShowcase } from "@/components/home/showcase";
import { BeforeAfter } from "@/components/home/before-after";
import { ConversionBlock } from "@/components/home/conversion";
import { DemoVideo } from "@/components/clips/demo-video";
import { FilmSchema } from "@/components/home/film-schema";
import { InstagramMark, MetaMark } from "@/components/mairo/marks";
import { AmbientSky } from "@/components/ambient-sky";
import { USABLE_TOOLS } from "@/lib/tools/registry";
import { brandFont } from "@/lib/fonts";

// The homepage: MAIRO shown working, at every stage, by short videos of the
// product itself — each clip drawn from the signed-in app's own components
// for one clearly labelled fictional shop (components/clips/), rendered to
// video, and played only while it's on screen. Each section has its own
// composition, so the page never reads as one card layout repeated:
//
//   1. Hero: the free plan, started here, and the plan being made
//   2. The product film, full width — the centerpiece
//   3. How it works: five steps beside one player that follows the scroll
//   4. The creative showcase, set as finished ads on a paper band
//   5. Dashboard & results: one wide player, two views, the Simple view
//   6. The AI team as one workflow, and what always waits for the owner
//   7. Before and after · where MAIRO works · who it's for · trust
//   8. Put it to work · pricing · FAQ · the final call
//
// Rules above the design: no invented customers, reviews, counts, results or
// integrations; every figure in a clip is sample data and says so; the free
// plan is free, and a subscription is only for building and running real
// campaigns, each of which waits for the owner's approval.

const CTA = { href: "/preview", label: "Build My Free AI Ad Plan" };

const FILM_CHAPTERS = ["Discovery", "Strategy", "Creative", "Campaign", "Approval", "Dashboard", "Recommendations"];

const SOLUTIONS = [
  { title: "Local & service businesses", body: "Plumbers, clinics, salons, studios: leads and bookings from people near you, followed through to the jobs they became.", links: [{ href: "/solutions/local-services", label: "Local services" }, { href: "/solutions/appointments", label: "Appointments" }] },
  { title: "Online stores", body: "Sales campaigns built from your products and offers, judged on purchases — with Shopify connected to measure what sold.", links: [{ href: "/solutions/online-stores", label: "Online stores" }] },
  { title: "Teams and brands", body: "Six roles from Owner to Viewer, approvals and an audit log. MAIRO Scale covers up to three businesses or brands, each with its own Meta ad account.", links: [{ href: "/pricing", label: "See MAIRO Scale" }] },
];

export function ConsoleHome() {
  const toolsLive = USABLE_TOOLS().length > 0;
  return (
    <div className={`${brandFont.className} relative isolate min-h-screen overflow-x-clip bg-paper text-white`}>
      <AmbientSky />
      <RevealOnScroll />
      <LandingNav toolsLive={toolsLive} />
      <main>
        <ConsoleHero />

        {/* 2 — the film, the centerpiece: right under the hero, full width */}
        <section id="film" aria-labelledby="film-title" className="relative scroll-mt-16 pb-20 pt-6 sm:pb-28 sm:pt-10">
          <span id="walkthrough" aria-hidden className="block scroll-mt-20" />
          <div aria-hidden className="pointer-events-none absolute inset-x-0 top-[18%] -z-10 h-[70%] bg-[radial-gradient(ellipse_50%_55%_at_50%_50%,rgba(255,255,255,0.18),transparent_72%)]" />
          <div className="mx-auto max-w-[1320px] px-4 sm:px-8 lg:px-12">
            <div data-reveal className="flex flex-wrap items-end justify-between gap-x-10 gap-y-4">
              <div className="max-w-[720px]">
                <p className="text-[12px] font-semibold uppercase tracking-[0.16em] text-cyan-300/90">The product film · 74 seconds</p>
                <h2 id="film-title" className="mt-3 text-[clamp(32px,4.8vw,64px)] font-semibold leading-[1.0] tracking-[-0.045em] text-white [text-wrap:balance]">
                  Meet your AI advertising team.
                </h2>
              </div>
              <p className="max-w-[420px] text-[16.5px] leading-relaxed text-white/66">From your first idea to your next campaign — one fictional shop, start to finish, inside MAIRO.</p>
            </div>
            <div data-reveal className="mt-10">
              <DemoVideo id="film" title="MAIRO product film: a fictional shop from its website to its first recommendation" />
            </div>
            <ol className="mt-6 grid grid-cols-2 gap-x-6 gap-y-3 text-[13px] sm:grid-cols-4 lg:grid-cols-7">
              {FILM_CHAPTERS.map((c, i) => (
                <li key={c} className="flex items-baseline gap-2 text-white/55">
                  <span className="font-mono text-[11px] text-cyan-300/80">{String(i + 1).padStart(2, "0")}</span>
                  {c}
                </li>
              ))}
            </ol>
            <FilmSchema />
          </div>
        </section>

        {/* 3 — how it works, step by step, as you scroll */}
        <span id="approval" aria-hidden className="block scroll-mt-20" />
        <Walkthrough />

        {/* 4 — the creative showcase, on paper */}
        <span id="features" aria-hidden className="block scroll-mt-16" />
        <span id="creatives" aria-hidden className="block scroll-mt-16" />
        <CreativeShowcase />

        {/* 5 — the dashboard and results; 6 — the AI team and approvals */}
        <DashboardTour />
        <TeamSection />

        <BeforeAfter />

        {/* Where MAIRO works — stated exactly. */}
        <section aria-label="Where MAIRO works" className="mx-auto max-w-[1280px] px-4 py-8 sm:px-8 lg:px-12">
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
              MAIRO advertises on Facebook and Instagram through your own Meta ad account. Results come from Meta, the leads you mark and, if you connect it, your Shopify store. It doesn&rsquo;t run TikTok or Google ads, and it doesn&rsquo;t make AI-generated videos.
            </p>
          </div>
        </section>

        {/* Solutions, briefly. */}
        <section id="solutions" aria-labelledby="solutions-title" className="relative mx-auto max-w-[1280px] scroll-mt-20 px-4 py-12 sm:px-8 lg:px-12">
          <h2 id="solutions-title" className="text-[13px] font-semibold uppercase tracking-[0.16em] text-white/50">
            Built for
          </h2>
          <ul className="mt-4 grid gap-3 md:grid-cols-3">
            {SOLUTIONS.map((s) => (
              <li key={s.title} className="flex flex-col rounded-[22px] border p-5" style={{ borderColor: "var(--mairo-line)" }}>
                <p className="text-[16px] font-semibold text-white">{s.title}</p>
                <p className="mt-1.5 text-[13.5px] leading-relaxed text-white/62">{s.body}</p>
                <p className="mt-auto flex flex-wrap gap-x-4 gap-y-1 pt-3 text-[13.5px]">
                  {s.links.map((l) => (
                    <Link key={l.href} href={l.href} className="text-cyan-200 hover:text-white">
                      {l.label} <span aria-hidden>→</span>
                    </Link>
                  ))}
                </p>
              </li>
            ))}
          </ul>
        </section>

        <TrustBlock />
        <ConversionBlock />
        <PricingBlock cta={CTA} />
        <FaqBlock />

        {/* The final call */}
        <section className="relative mx-auto max-w-[1280px] px-4 pb-24 pt-10 sm:px-8 lg:px-12">
          <div data-reveal className="relative overflow-hidden rounded-[32px] border px-6 py-16 text-center sm:px-12" style={{ borderColor: "rgba(255,255,255,0.32)", background: "radial-gradient(80% 120% at 50% 0%, rgba(255,255,255,0.26), transparent 60%), #141414" }}>
            <h2 className="mx-auto max-w-[900px] text-[clamp(32px,5vw,64px)] font-semibold leading-[0.98] tracking-[-0.045em] text-white [text-wrap:balance]">Your AI advertising team is ready.</h2>
            <p className="mx-auto mt-5 max-w-[560px] text-[17px] leading-relaxed text-white/70">Start with a free plan for your business. No credit card, and no ads launched.</p>
            <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Link href={CTA.href} className="inline-flex min-h-[56px] items-center gap-2 rounded-full bg-[image:var(--mairo-ramp)] px-8 text-[16px] font-semibold text-black shadow-[0_18px_44px_-16px_rgba(255,255,255,0.85)] transition hover:brightness-110">
                Build Your Free Ad Plan <span aria-hidden>→</span>
              </Link>
              <a href="#film" className="inline-flex min-h-[56px] items-center rounded-full border border-white/15 px-7 text-[16px] font-semibold text-white transition hover:border-white/40">
                Watch the product film
              </a>
            </div>
          </div>
        </section>
      </main>
      <SiteFooter toolsLive={toolsLive} />
      <LandingBeacon variant="story" />
    </div>
  );
}
