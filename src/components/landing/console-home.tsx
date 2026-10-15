import Link from "next/link";
import { LandingNav } from "@/components/landing/landing-nav";
import { SiteFooter } from "@/components/landing/site-footer";
import { LandingBeacon } from "@/components/landing/landing-beacon";
import { PricingBlock, TrustBlock, FaqBlock } from "@/components/landing/home";
import { ConsoleHero } from "@/components/landing/console-hero";
import { RevealOnScroll } from "@/components/landing/console-sections";
import { DemoSection } from "@/components/home/demo-section";
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
// video, and played only while it's on screen.
//
//   1. Hero: the free plan, started here, and the plan being made
//   2. The Creative Studio — first, because the ads are what catch the eye
//   3. The creative showcase: sample ads for many kinds of business
//   4. The product film: "Meet your AI advertising team."
//   5–10. Business understood · campaigns · the AI team · the dashboard ·
//         decisions · results — one clip each, sides alternating
//   11. Before and after · where MAIRO works · trust
//   12. Put it to work · pricing · FAQ · the final call
//
// Rules above the design: no invented customers, reviews, counts, results or
// integrations; every figure in a clip is sample data and says so; the free
// plan is free, and a subscription is only for building and running real
// campaigns, each of which waits for the owner's approval.

const CTA = { href: "/preview", label: "Build My Free AI Ad Plan" };

const SOLUTIONS = [
  { title: "Local & service businesses", body: "Plumbers, clinics, salons, studios: leads and bookings from people near you, followed through to the jobs they became.", links: [{ href: "/solutions/local-services", label: "Local services" }, { href: "/solutions/appointments", label: "Appointments" }] },
  { title: "Online stores", body: "Sales campaigns built from your products and offers, judged on purchases — with Shopify connected to measure what sold.", links: [{ href: "/solutions/online-stores", label: "Online stores" }] },
  { title: "Teams and agencies", body: "Six roles from Owner to Viewer, approvals and an audit log; a workspace per client. Studio and Agency plans aren't on sale yet.", links: [{ href: "/for-freelancers", label: "Freelancers & agencies" }] },
];

export function ConsoleHome() {
  const toolsLive = USABLE_TOOLS().length > 0;
  return (
    <div className={`${brandFont.className} relative isolate min-h-screen overflow-x-hidden bg-paper text-white`}>
      <AmbientSky />
      <RevealOnScroll />
      <LandingNav toolsLive={toolsLive} cta={{ href: "/preview", label: "Get Started" }} />
      <main>
        <ConsoleHero />

        {/* 2 — the Creative Studio, first */}
        <span id="creatives" aria-hidden className="block scroll-mt-20" />
        <DemoSection
          id="creative-studio"
          eyebrow="AI Creative Studio"
          title="Creative ideas built around your brand."
          body="MAIRO suggests angles from what your business actually says, writes the words, and — with a subscription — makes the finished picture. Preview it in the Facebook and Instagram feeds, change any word, and approve it. Concepts are free; nothing is published."
          clip="creative"
          clipTitle="MAIRO's Creative Studio making ads for a fictional shop"
          cta={{ href: "/preview", label: "Explore Creative Studio →" }}
        />

        <CreativeShowcase />

        {/* 4 — the film */}
        <section id="film" aria-labelledby="film-title" className="relative scroll-mt-20 py-16 sm:py-24">
          <span id="walkthrough" aria-hidden className="block scroll-mt-20" />
          <div className="mx-auto max-w-[1180px] px-4 sm:px-8 lg:px-12">
            <div data-reveal className="mx-auto max-w-[760px] text-center">
              <p className="text-[12px] font-semibold uppercase tracking-[0.16em] text-cyan-300/90">The product film · 74 seconds</p>
              <h2 id="film-title" className="mt-3 text-[clamp(30px,4.4vw,56px)] font-semibold leading-[1.02] tracking-[-0.04em] text-white [text-wrap:balance]">
                Meet your AI advertising team.
              </h2>
              <p className="mt-4 text-[17px] leading-relaxed text-white/68">From your first idea to your next campaign, see how MAIRO makes advertising simpler.</p>
            </div>
            <div data-reveal className="mt-10">
              <DemoVideo id="film" title="MAIRO product film: a fictional shop from its website to its first recommendation" />
            </div>
            <FilmSchema />
          </div>
        </section>

        {/* 5–10 — every stage, one clip each */}
        <DemoSection
          id="understand"
          eyebrow="Business discovery"
          title="Your business. Understood by AI."
          body="Give MAIRO your website, your Instagram or a sentence. It reads your public pages and tells you what it found and where — your own facts kept apart from its suggestions, so nothing about your business is guessed."
          clip="understand"
          clipTitle="MAIRO reading a fictional shop's website and saying what it understood"
          cta={{ href: "/preview", label: "Analyze My Business →" }}
          flip
        />
        <span id="approval" aria-hidden className="block scroll-mt-20" />
        <DemoSection
          id="campaigns"
          eyebrow="Campaign builder"
          title="From strategy to campaign. Without the complexity."
          body="Connect your own Meta ad account and MAIRO builds the campaign from your plan: the objective, the audience, the placements, the budget and your approved creative. You see it all before approving, and it's shown live only when Meta confirms."
          clip="campaign"
          clipTitle="Building a Meta campaign for a fictional shop in MAIRO's campaign builder"
          cta={{ href: "/help/getting-started", label: "See How Campaigns Work →" }}
        />
        <DemoSection
          id="ai-team"
          eyebrow="Your AI team"
          title="An entire advertising team, powered by AI."
          body="Eight AI specialties of one system — strategy, creative, audience, campaigns, optimisation, budget, analytics and growth. Each one's state comes from what it actually did, with the time it did it. When there's nothing to do, it says so."
          clip="team"
          clipTitle="One morning's review by MAIRO's AI team for a fictional shop"
          cta={{ href: "/help/approvals", label: "Meet Your AI Team →" }}
          flip
        />
        <DemoSection
          id="dashboard"
          eyebrow="The dashboard"
          title="Every result. One clear dashboard."
          body="Overview, campaigns, creatives, performance, your AI team, recommendations, approvals and results — in one place, in plain words. Every figure says where it comes from; the clip shows sample data."
          clip="dashboard"
          clipTitle="Moving through the MAIRO dashboard of a fictional shop"
          cta={{ href: "/help/results", label: "Explore the Dashboard →" }}
        />
        <DemoSection
          id="decisions"
          eyebrow="Recommendations"
          title="Smarter decisions, backed by your results."
          body="When MAIRO finds something worth changing, it says what it noticed, which campaign it's about, the evidence, the effect on your budget and the risk — and waits for your approval. Small, reversible changes run on their own only if you allow it, inside your limits."
          clip="optimize"
          clipTitle="A recommendation from MAIRO, with its evidence, for a fictional shop"
          cta={{ href: "/help/approvals", label: "See MAIRO Decisions →" }}
          flip
        />
        <DemoSection
          id="results"
          eyebrow="Results"
          title="Know what's working. Know what comes next."
          body="Performance from Meta, the sales your store confirms or the leads you mark as booked, and a weekly summary in plain words — with what MAIRO suggests next. Revenue shows only when your store or your own records provide it."
          clip="results"
          clipTitle="The MAIRO Results page for a fictional shop and a fictional service business"
          cta={{ href: "/help/results", label: "See Your Results →" }}
        />

        <span id="how-it-works" aria-hidden className="block scroll-mt-20" />
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
          <div data-reveal className="relative overflow-hidden rounded-[32px] border px-6 py-16 text-center sm:px-12" style={{ borderColor: "rgba(47,107,255,0.32)", background: "radial-gradient(80% 120% at 50% 0%, rgba(47,107,255,0.26), transparent 60%), #0a0f1f" }}>
            <h2 className="mx-auto max-w-[900px] text-[clamp(32px,5vw,64px)] font-semibold leading-[0.98] tracking-[-0.045em] text-white [text-wrap:balance]">Your AI advertising team is ready.</h2>
            <p className="mx-auto mt-5 max-w-[560px] text-[17px] leading-relaxed text-white/70">Start with a free plan for your business. No credit card, and no ads launched.</p>
            <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Link href={CTA.href} className="inline-flex min-h-[56px] items-center gap-2 rounded-full bg-[image:var(--mairo-ramp)] px-8 text-[16px] font-semibold text-white shadow-[0_18px_44px_-16px_rgba(47,107,255,0.85)] transition hover:brightness-110">
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
