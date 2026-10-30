import Link from "next/link";
import { LandingNav } from "@/components/landing/landing-nav";
import { SiteFooter } from "@/components/landing/site-footer";
import { LandingBeacon } from "@/components/landing/landing-beacon";
import { PricingBlock, TrustBlock, FaqBlock } from "@/components/landing/home";
import { RevealOnScroll } from "@/components/landing/console-sections";
import { HeroStarter } from "@/components/home/hero-starter";
import { CreativeShowcase } from "@/components/home/showcase";
import { DemoVideo } from "@/components/clips/demo-video";
import { FilmSchema } from "@/components/home/film-schema";
import { InstagramMark, MetaMark } from "@/components/mairo/marks";
import { USABLE_TOOLS } from "@/lib/tools/registry";
import { brandFont } from "@/lib/fonts";
import { CinematicBackdrop } from "@/components/cinematic/home/director";
import { CinematicHero } from "@/components/cinematic/home/hero";
import { FinalScene, StoryScenes } from "@/components/cinematic/home/scenes";

// The homepage: a short film you scroll through, then the facts.
//
//   1. The hero: particles arrive out of the dark as the wordmark and gather
//      into MAIRO's core — "Your business. Powered by AI."
//   2. Five scenes, one particle system moving through them as you scroll
//      (components/cinematic/): advertising got complicated · we made it
//      simple · AI creates your advertising · from idea to live campaign ·
//      powerful AI, simple decisions
//   3. Start here (the free plan, begun on the page), the product film,
//      the creative showcase, where MAIRO works, who it's for, trust,
//      pricing and the FAQ — on plain dark, the particles resting
//   4. The final scene: the core again, and one call to action
//
// Rules above the design: no invented customers, reviews, counts, results or
// integrations; every figure shown is sample data for a fictional business
// and says so; the free plan is free, and a subscription is only for building
// and running real campaigns, each of which waits for the owner's approval.
// The particles are decoration: every word is real text, and the page reads
// the same without WebGL, without script and under reduced motion.

const CTA = { href: "/preview", label: "Build my free plan" };

const FILM_CHAPTERS = ["Discovery", "Strategy", "Creative", "Campaign", "Approval", "Dashboard", "Recommendations"];

const SOLUTIONS = [
  { title: "Local & service businesses", body: "Plumbers, clinics, salons, studios: leads and bookings from people near you, followed through to the jobs they became.", links: [{ href: "/solutions/local-services", label: "Local services" }, { href: "/solutions/appointments", label: "Appointments" }] },
  { title: "Online stores", body: "Sales campaigns built from your products and offers, judged on purchases — with Shopify connected to measure what sold.", links: [{ href: "/solutions/online-stores", label: "Online stores" }] },
  { title: "Teams and brands", body: "Six roles from Owner to Viewer, approvals and an audit log. MAIRO Scale covers up to three businesses or brands, each with its own Meta ad account.", links: [{ href: "/pricing", label: "See MAIRO Scale" }] },
];

export function ConsoleHome() {
  const toolsLive = USABLE_TOOLS().length > 0;
  return (
    <div className={`${brandFont.className} relative isolate min-h-screen overflow-x-clip bg-[#020309] text-white`}>
      <CinematicBackdrop />
      <RevealOnScroll />
      <LandingNav toolsLive={toolsLive} cta={{ href: CTA.href, label: "Build my free plan" }} />
      <main className="relative z-10">
        <CinematicHero ctaHref={CTA.href} />
        <StoryScenes />

        {/* Start here: the free plan, begun on the page. */}
        <section id="start" aria-labelledby="start-title" className="relative scroll-mt-20 px-5 pb-24 pt-10 sm:px-10">
          <div data-reveal className="mairo-glass mx-auto max-w-[760px] rounded-[32px] p-6 sm:p-10">
            <p className="text-[12px] font-semibold uppercase tracking-[0.28em] text-[#8fb4ff]">Free AI plan</p>
            <h2 id="start-title" className="mt-3 text-[clamp(28px,4vw,44px)] font-semibold leading-[1.05] tracking-[-0.035em] text-white">Tell MAIRO about your business.</h2>
            <p className="mt-3 max-w-[560px] text-[16px] leading-relaxed text-white/68">A personalized Meta advertising strategy, creative ideas, audiences and a budget plan — free, in about a minute.</p>
            <div className="mt-6">
              <HeroStarter />
            </div>
            <p className="mt-4 text-[13.5px]">
              <a href="/preview/example" className="inline-flex min-h-11 items-center text-white/60 underline-offset-4 hover:text-white hover:underline">See an example plan</a>
            </p>
          </div>
        </section>

        {/* The product film: the real app, one fictional shop, start to finish. */}
        <section id="film" aria-labelledby="film-title" className="relative scroll-mt-16 pb-20 pt-6 sm:pb-28">
          <span id="walkthrough" aria-hidden className="block scroll-mt-20" />
          <div className="mx-auto max-w-[1320px] px-4 sm:px-8 lg:px-12">
            <div data-reveal className="flex flex-wrap items-end justify-between gap-x-10 gap-y-4">
              <div className="max-w-[720px]">
                <p className="text-[12px] font-semibold uppercase tracking-[0.28em] text-[#8fb4ff]">The product film · 74 seconds</p>
                <h2 id="film-title" className="mt-3 text-[clamp(32px,4.8vw,64px)] font-semibold leading-[1.0] tracking-[-0.045em] text-white [text-wrap:balance]">
                  See the real thing.
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
                  <span className="font-mono text-[11px] text-[#8fb4ff]">{String(i + 1).padStart(2, "0")}</span>
                  {c}
                </li>
              ))}
            </ol>
            <FilmSchema />
          </div>
        </section>

        <span id="approval" aria-hidden className="block scroll-mt-20" />
        <span id="features" aria-hidden className="block scroll-mt-16" />
        <span id="creatives" aria-hidden className="block scroll-mt-16" />
        <CreativeShowcase />

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
                    <Link key={l.href} href={l.href} className="inline-flex min-h-11 items-center sm:pointer-fine:min-h-0 text-cyan-200 hover:text-white">
                      {l.label} <span aria-hidden>→</span>
                    </Link>
                  ))}
                </p>
              </li>
            ))}
          </ul>
        </section>

        <TrustBlock />
        <PricingBlock cta={CTA} />
        <FaqBlock />

        <FinalScene ctaHref={CTA.href} />
      </main>
      <SiteFooter toolsLive={toolsLive} />
      <LandingBeacon variant="story" />
    </div>
  );
}
