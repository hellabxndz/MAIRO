"use client";

import { FreePlanForm } from "@/components/preview/free-plan-form";
import { DemoFrame, DemoScreen, ScaledFrame } from "@/components/console/demo";
import { BusinessArt } from "@/components/hero-story/art";
import { EXAMPLES } from "@/lib/demo/examples";
import { heroVariant, track } from "@/lib/analytics/track";

// The first screen: the outcome in one line — "Your Business Has More
// Potential. Let MAIRO Show You." — and the free plan, started right here in
// three ways (a few facts, an Instagram username, or a website; none needs a
// site). Then MAIRO itself — the real dashboard, drawn with the same
// components the signed-in app uses, for a clearly labelled fictional
// business. Around it, sample ad concepts for six kinds of business, each
// labelled as one.

type Industry = { key: string; label: string; headline: string; brand: string; art?: "shop" | "service" | "appointments"; tone?: string };

const INDUSTRIES: Industry[] = [
  { key: "shop", label: "Ecommerce", headline: EXAMPLES.shop.concepts[0].hook, brand: EXAMPLES.shop.name, art: "shop" },
  { key: "service", label: "Local services", headline: EXAMPLES.service.concepts[0].hook, brand: EXAMPLES.service.name, art: "service" },
  { key: "luxury", label: "Luxury brands", headline: "Hand-finished. Made to order.", brand: "Maison Ardent", tone: "radial-gradient(120% 90% at 80% 0%, rgba(214,178,102,0.45), transparent 55%), linear-gradient(160deg,#17130c,#0b0907)" },
  { key: "saas", label: "SaaS companies", headline: "Close the books in an afternoon.", brand: "Ledgerly", tone: "radial-gradient(120% 90% at 80% 0%, rgba(53,108,255,0.55), transparent 55%), linear-gradient(160deg,#0b1636,#070b18)" },
  { key: "agency", label: "Marketing agencies", headline: "Every client's ads, one place.", brand: "Northbeam Studio", tone: "radial-gradient(120% 90% at 80% 0%, rgba(121,82,255,0.6), transparent 55%), linear-gradient(160deg,#1a1240,#0b0a1c)" },
  { key: "brands", label: "Multi-brand teams", headline: EXAMPLES.appointments.concepts[0].hook, brand: EXAMPLES.appointments.name, art: "appointments" },
];

function IndustryCard({ i, className = "" }: { i: Industry; className?: string }) {
  return (
    <figure className={`overflow-hidden rounded-[18px] border bg-[#0d1020] shadow-[0_30px_70px_-30px_rgba(0,0,0,0.95)] ${className}`} style={{ borderColor: "rgba(164,172,195,0.18)" }}>
      <div className="flex items-center gap-1.5 px-2.5 py-2">
        <span aria-hidden className="flex h-5 w-5 items-center justify-center rounded-full bg-[image:var(--mairo-ramp)] text-[9px] font-semibold text-white">{i.brand.charAt(0)}</span>
        <span className="min-w-0 truncate text-[10.5px] font-semibold text-white">{i.brand}</span>
        <span className="ml-auto text-[9px] text-white/40">Sponsored</span>
      </div>
      <div className="relative aspect-[4/5]" style={i.tone ? { background: i.tone } : undefined}>
        {i.art ? <BusinessArt type={i.art} variant="demo" className="h-full w-full" /> : null}
        <p className="absolute inset-x-2.5 bottom-2.5 text-[13px] font-semibold leading-snug text-white drop-shadow-[0_2px_8px_rgba(0,0,0,0.6)] [text-wrap:balance]">{i.headline}</p>
      </div>
      <figcaption className="px-2.5 py-1.5 text-[9.5px] font-semibold uppercase tracking-[0.14em] text-amber-200/90">Sample concept · {i.label}</figcaption>
    </figure>
  );
}

export function ConsoleHero() {
  return (
    <section id="product" aria-labelledby="hero-title" className="relative isolate scroll-mt-20 overflow-hidden pb-10 pt-[96px] sm:pt-[136px]">
      {/* The night, lit from above: a violet bloom behind the headline, a cooler blue falling in from the side. */}
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(ellipse_55%_45%_at_50%_0%,rgba(121,82,255,0.32),transparent_70%),radial-gradient(ellipse_40%_35%_at_8%_30%,rgba(53,108,255,0.16),transparent_70%),radial-gradient(ellipse_45%_35%_at_92%_40%,rgba(121,82,255,0.14),transparent_70%)]" />
      <div aria-hidden className="mairo-grid pointer-events-none absolute inset-0 -z-10 opacity-60" />

      <div className="mx-auto max-w-[1360px] px-5 sm:px-8 lg:px-12">
        <div className="mx-auto max-w-[980px] text-center">
          <p className="inline-flex items-center gap-2 rounded-full border border-violet-400/30 bg-violet-500/[0.10] px-3.5 py-1.5 text-[12.5px] font-medium text-white/85">
            <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-violet-bright" />
            AI advertising for Facebook &amp; Instagram
          </p>
          <h1 id="hero-title" className="mt-6 text-[clamp(35px,7vw,92px)] font-semibold leading-[0.98] tracking-[-0.05em] text-white [text-wrap:balance]">
            Your Business Has More Potential.{" "}
            <span className="block bg-gradient-to-r from-[#c7b8ff] via-[#a891ff] to-[#7c9dff] bg-clip-text pb-[0.06em] text-transparent">Let MAIRO Show You.</span>
          </h1>
          <p className="mx-auto mt-5 max-w-[700px] text-[clamp(15.5px,1.5vw,20px)] leading-relaxed text-white/72 sm:mt-6">
            Tell us about your business, share your Instagram, or add your website. MAIRO will analyze the information available, identify advertising opportunities, and build a personalized AI advertising plan designed around your goals. Completely free to explore.
          </p>
        </div>

        <div className="mx-auto mt-7 max-w-[720px] sm:mt-9" onClickCapture={(e) => (e.target as HTMLElement).closest("button[type=submit]") && track({ name: "hero_cta", props: { cta: "free_plan", variant: heroVariant() } })}>
          <FreePlanForm compact idPrefix="hero" />
          <p className="mt-4 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-[14px]">
            <a href="#walkthrough" onClick={() => track({ name: "hero_cta", props: { cta: "watch", variant: heroVariant() } })} className="inline-flex min-h-[44px] items-center gap-2.5 rounded-full border border-white/15 bg-white/[0.03] pl-1.5 pr-4 font-semibold text-white transition hover:border-violet-400/60">
              <span aria-hidden className="flex h-8 w-8 items-center justify-center rounded-full bg-[image:var(--mairo-ramp)]">
                <svg viewBox="0 0 12 12" className="ml-0.5 h-3 w-3 fill-white">
                  <path d="M2 1.2v9.6L10.5 6z" />
                </svg>
              </span>
              Watch MAIRO in Action
            </a>
            <a href="/preview?example=service" className="text-white/70 underline-offset-4 hover:text-white hover:underline">
              See an example plan
            </a>
          </p>
        </div>

        {/* MAIRO itself, with sample creative concepts around it. */}
        {/* Wide screens leave room beside the dashboard for the concepts; below that they sit in a row underneath, so nothing covers the product. */}
        <div className="relative mx-auto mt-16 max-w-[1240px] sm:mt-20 min-[1400px]:max-w-[1040px]">
          <div aria-hidden className="pointer-events-none absolute -inset-x-10 -bottom-10 top-10 -z-10 rounded-[60px] bg-[radial-gradient(ellipse_at_center,rgba(121,82,255,0.35),transparent_65%)] blur-2xl" />
          <div className="mairo-tilt">
            <ScaledFrame width={1280} minScale={0.8} maxHeight={1240}>
              <DemoFrame view="overview">
                <DemoScreen view="overview" />
              </DemoFrame>
            </ScaledFrame>
          </div>
          <div aria-hidden className="pointer-events-none absolute inset-y-0 -left-[156px] -right-[156px] hidden min-[1400px]:block">
            <IndustryCard i={INDUSTRIES[0]} className="mairo-float absolute left-0 top-6 w-[140px] -rotate-6" />
            <IndustryCard i={INDUSTRIES[2]} className="mairo-float absolute left-2 top-[38%] w-[140px] rotate-3 [animation-delay:-2s]" />
            <IndustryCard i={INDUSTRIES[4]} className="mairo-float absolute bottom-0 left-0 w-[140px] -rotate-3 [animation-delay:-4s]" />
            <IndustryCard i={INDUSTRIES[1]} className="mairo-float absolute right-0 top-2 w-[140px] rotate-6 [animation-delay:-1s]" />
            <IndustryCard i={INDUSTRIES[3]} className="mairo-float absolute right-2 top-[36%] w-[140px] -rotate-3 [animation-delay:-3s]" />
            <IndustryCard i={INDUSTRIES[5]} className="mairo-float absolute bottom-0 right-0 w-[140px] rotate-3 [animation-delay:-5s]" />
          </div>
        </div>

        {/* On smaller screens the same concepts sit in a row under the dashboard. */}
        <ul aria-label="Sample ad concepts for six kinds of business" className="-mx-5 mt-8 flex snap-x gap-3 overflow-x-auto px-5 pb-2 min-[1400px]:hidden [&>li:first-child]:ml-auto [&>li:last-child]:mr-auto">
          {INDUSTRIES.map((i) => (
            <li key={i.key} className="shrink-0 snap-start">
              <IndustryCard i={i} className="w-[156px]" />
            </li>
          ))}
        </ul>
        <p className="mt-5 text-center text-[12px] text-white/45">Product demo with sample data for fictional businesses. No real customer, result or ad is shown.</p>
      </div>
    </section>
  );
}
