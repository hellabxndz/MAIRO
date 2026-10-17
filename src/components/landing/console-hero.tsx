"use client";

import { HeroStarter } from "@/components/home/hero-starter";
import { HeroPlanDemo } from "@/components/home/hero-plan-demo";
import { IconSparkle } from "@/components/plan-generator/icons";
import { heroVariant, track } from "@/lib/analytics/track";

// The first screen: "Your next ad strategy, built by AI." — and the free
// plan started right there, as a short conversation (components/home/
// hero-starter.tsx). Opposite it on wide screens, and under it on phones,
// the plan being made on a loop for a clearly labelled fictional business
// (components/home/hero-plan-demo.tsx). The plan itself is made on /preview.

export function ConsoleHero() {
  return (
    <section id="product" aria-labelledby="hero-title" className="relative isolate scroll-mt-20 overflow-hidden pb-14 pt-[92px] sm:pb-20 sm:pt-[128px]">
      {/* Lit from above: one restrained blue bloom, a faint cyan edge. */}
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(ellipse_60%_45%_at_30%_0%,rgba(47,107,255,0.24),transparent_70%),radial-gradient(ellipse_40%_35%_at_85%_25%,rgba(56,189,248,0.08),transparent_70%)]" />
      <div aria-hidden className="mairo-grid pointer-events-none absolute inset-0 -z-10 opacity-40" />

      <div className="mx-auto grid max-w-[1240px] items-center gap-10 px-4 sm:px-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,500px)] lg:gap-14 lg:px-12">
        <div className="min-w-0">
          <p className="inline-flex items-center gap-2 rounded-full border border-white/[0.12] bg-white/[0.03] px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-white/75 sm:text-[11.5px]">
            <IconSparkle className="h-3.5 w-3.5 text-cyan-300" />
            Free AI Meta ad plan
          </p>
          <h1 id="hero-title" className="mt-5 text-[clamp(36px,5.6vw,68px)] font-semibold leading-[1.0] tracking-[-0.045em] text-white [text-wrap:balance]">
            Your next ad strategy, <span className="bg-gradient-to-r from-[#bcd4ff] via-[#7fb0ff] to-[#5cc8ff] bg-clip-text pb-[0.06em] text-transparent">built by AI.</span>
          </h1>
          <p className="mt-4 max-w-[560px] text-[clamp(15.5px,1.35vw,18px)] leading-relaxed text-white/70 sm:mt-5">
            Tell MAIRO about your business. Get a personalized Meta advertising strategy, creative ideas, audience recommendations, and a budget plan — free.
          </p>

          <div className="mt-6 max-w-[600px] sm:mt-7">
            <HeroStarter />
          </div>

          <p className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-[13.5px]">
            <a href="#film" onClick={() => track({ name: "hero_cta", props: { cta: "watch", variant: heroVariant() } })} className="inline-flex min-h-[44px] items-center gap-2.5 font-medium text-white/80 transition hover:text-white">
              <span aria-hidden className="flex h-7 w-7 items-center justify-center rounded-full border border-white/20">
                <svg viewBox="0 0 12 12" className="ml-0.5 h-2.5 w-2.5 fill-white">
                  <path d="M2 1.2v9.6L10.5 6z" />
                </svg>
              </span>
              Watch MAIRO in action
            </a>
            <a href="/preview/example" className="text-white/55 underline-offset-4 hover:text-white hover:underline">
              See an example plan
            </a>
          </p>
        </div>

        <div className="min-w-0">
          <HeroPlanDemo className="hidden lg:block" />
          <HeroPlanDemo compact className="lg:hidden" />
        </div>
      </div>
    </section>
  );
}
