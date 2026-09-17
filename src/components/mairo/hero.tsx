import type { ReactNode } from "react";
import { MairoCore } from "@/components/mairo/core";
import { MairoButton, MairoCard, HudLabel, Chip } from "@/components/mairo";

// The MAIRO hero, built from the desktop reference render.
//
// The reference is a symmetrical composition: the intelligence core dead
// centre, two capability cards down each side, HUD labels in the corners. That
// works at 1440px and collapses badly at 390px, so the layout here is the same
// composition expressed twice — a three-column grid on large screens, and a
// single column on a phone where the core leads and the four cards stack under
// it. Same elements, same order of importance, no separate mobile markup.
//
// Two things from the reference are deliberately not reproduced:
//
//   The "trusted by" row of Shopify, Meta, Google, Samsung, Nike, allbirds,
//   Stripe and Notion logos. MAIRO does not have those customers, and putting
//   their marks under the words "trusted by ambitious brands" is a false
//   endorsement — the kind that gets a letter from Nike's lawyers rather than
//   a signup. The slot is kept and filled with what is actually true.
//
//   The "+287% Avg. ROAS uplift", "3.2x Higher ROAS" and "10x Faster
//   campaigns" figures. These are invented performance claims for an
//   advertising product, which is the one category where inventing them is
//   both illegal and the brief's own rule — "MAIRO must NEVER guarantee
//   advertising results". The cards keep their shape and say what the system
//   does instead of what it promises it will earn you.

type Capability = {
  badge: string;
  title: string;
  body: string;
  icon: ReactNode;
  chips?: string[];
  children?: ReactNode;
};

const ICON = "h-4.5 w-4.5 text-blue-bright";

const CREATIVE: Capability = {
  badge: "builds",
  title: "Creative AI",
  body: "Turns what you sell into ad concepts, headlines, hooks and variations — for each platform.",
  chips: ["Images", "Video", "Hooks", "Variations"],
  icon: (
    <svg viewBox="0 0 20 20" fill="none" className={ICON} aria-hidden>
      <rect x="2.5" y="3.5" width="15" height="13" rx="2.5" stroke="currentColor" strokeWidth="1.3" />
      <circle cx="7.5" cy="8" r="1.4" stroke="currentColor" strokeWidth="1.3" />
      <path d="M3.5 14l4-4 3.5 3.5 2.5-2 3 3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
};

const CAMPAIGN: Capability = {
  badge: "launches",
  title: "Campaign AI",
  body: "Builds the campaign, ad set and ad in your own account, then waits for you to approve it.",
  chips: ["Meta", "TikTok", "Instagram"],
  icon: (
    <svg viewBox="0 0 20 20" fill="none" className={ICON} aria-hidden>
      <path d="M17 3L9 11" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      <path d="M17 3l-5.2 14-2.6-6.2L3 8.2 17 3z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
    </svg>
  ),
};

const AUDIENCE: Capability = {
  badge: "finds",
  title: "Audience AI",
  body: "Turns “who are your customers?” into the targeting the platform actually needs.",
  chips: ["Location", "Age", "Lookalikes", "Retargeting"],
  icon: (
    <svg viewBox="0 0 20 20" fill="none" className={ICON} aria-hidden>
      <circle cx="7.5" cy="7" r="2.6" stroke="currentColor" strokeWidth="1.3" />
      <circle cx="14" cy="8.5" r="2" stroke="currentColor" strokeWidth="1.3" />
      <path d="M3 16c0-2.3 2-4 4.5-4s4.5 1.7 4.5 4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      <path d="M13.5 12.5c2 .3 3.5 1.7 3.5 3.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  ),
};

const OPTIMIZE: Capability = {
  badge: "improves",
  title: "Optimization AI",
  body: "Watches what changed, explains why in plain words, and proposes the next move for approval.",
  chips: ["Compare", "Explain", "Recommend"],
  icon: (
    <svg viewBox="0 0 20 20" fill="none" className={ICON} aria-hidden>
      <path d="M3 16V9M8 16V5M13 16v-4M18 16V7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  ),
};

function CapabilityCard({ badge, title, body, icon, chips }: Capability) {
  return (
    <MairoCard className="p-5 sm:p-6">
      <div className="flex items-start gap-3.5">
        <span
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border"
          style={{ borderColor: "var(--mairo-line)", background: "rgba(61,125,255,0.10)" }}
        >
          {icon}
        </span>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2.5">
            <h3 className="text-[15px] font-medium text-white">{title}</h3>
            <span
              className="rounded-full px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.16em] text-blue-bright"
              style={{ background: "rgba(61,125,255,0.14)" }}
            >
              {badge}
            </span>
          </div>
          <p className="mt-2 text-[13px] leading-relaxed text-muted">{body}</p>
          {chips && (
            <div className="mt-3.5 flex flex-wrap gap-1.5">
              {chips.map((c) => (
                <Chip key={c}>{c}</Chip>
              ))}
            </div>
          )}
        </div>
      </div>
    </MairoCard>
  );
}

export function MairoHero() {
  return (
    <section className="relative px-5 pb-16 pt-24 sm:px-8 sm:pb-20 sm:pt-28 lg:pb-28">
      <div className="mx-auto w-full max-w-[1400px]">
        {/* ---- The statement ---- */}
        <div className="relative z-10 mx-auto max-w-3xl text-center">
          <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-blue-bright/80 sm:text-[11px] sm:tracking-[0.38em]">
            Automate <span className="text-faint">|</span> Amplify{" "}
            <span className="text-faint">|</span> Grow beyond
          </p>

          <h1 className="mt-6 text-[clamp(34px,7.4vw,66px)] font-semibold leading-[1.04] tracking-[-0.03em] text-white">
            You run your business.
            <br />
            <span
              className="bg-clip-text text-transparent"
              style={{ backgroundImage: "var(--mairo-ramp-soft)" }}
            >
              Let Mairo run your ads.
            </span>
          </h1>

          <p className="mx-auto mt-5 max-w-xl text-[15px] leading-relaxed text-muted sm:mt-6 sm:text-base">
            An AI advertising system that builds creatives, launches campaigns, and helps
            optimize performance across Meta and TikTok.
          </p>

          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:mt-9 sm:flex-row">
            <MairoButton href="/sign-up" className="w-full sm:w-auto">
              Launch your ads
              <span aria-hidden>→</span>
            </MairoButton>
            <MairoButton href="#how-it-works" tone="ghost" className="w-full sm:w-auto">
              <span
                aria-hidden
                className="flex h-5 w-5 items-center justify-center rounded-full"
                style={{ background: "rgba(61,125,255,0.18)" }}
              >
                <svg viewBox="0 0 10 10" className="h-2.5 w-2.5 fill-white" aria-hidden>
                  <path d="M0 0l9 5-9 5z" />
                </svg>
              </span>
              See how it works
            </MairoButton>
          </div>
        </div>

        {/* ---- The core, with the capabilities around it ----

            Three columns on lg: cards, core, cards. On anything narrower the
            grid collapses to one column and the source order takes over — core
            first, because on a phone it is the thing worth leading with. */}
        <div className="mt-6 grid items-center gap-6 sm:mt-10 lg:mt-0 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)_minmax(0,1fr)] lg:gap-8 xl:-mt-4">
          {/* Left column — second on mobile, under the core. */}
          <div className="order-2 space-y-5 lg:order-1 lg:space-y-6">
            <div className="hidden lg:block">
              <HudLabel>
                Ideas to impact
                <br />
                in seconds
              </HudLabel>
            </div>
            <CapabilityCard {...CREATIVE} />
            <CapabilityCard {...CAMPAIGN} />
          </div>

          {/* The core. First on mobile. */}
          <div className="relative order-1 lg:order-2">
            <MairoCore className="mx-auto w-[min(86vw,400px)] lg:w-full lg:max-w-[430px]" />

            <div className="pointer-events-none mt-2 hidden justify-between lg:flex">
              <HudLabel>
                One AI core
                <br />
                everything you need
              </HudLabel>
              <HudLabel align="right">
                Real brands
                <br />
                real growth
              </HudLabel>
            </div>

            <div className="mt-6 flex justify-center lg:mt-8">
              <span
                className="rounded-full border px-4 py-2 text-center font-mono text-[9px] uppercase tracking-[0.2em] text-muted sm:text-[10px] sm:tracking-[0.26em]"
                style={{ borderColor: "var(--mairo-line)", background: "rgba(10,16,32,0.6)" }}
              >
                Ads performance compounded by AI
              </span>
            </div>
          </div>

          {/* Right column — third on mobile. */}
          <div className="order-3 space-y-5 lg:space-y-6">
            <div className="hidden justify-end lg:flex">
              <HudLabel align="right">
                Higher returns
                <br />
                with AI
              </HudLabel>
            </div>
            <CapabilityCard {...AUDIENCE} />
            <CapabilityCard {...OPTIMIZE} />
          </div>
        </div>
      </div>
    </section>
  );
}
