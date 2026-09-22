import type { ReactNode } from "react";
import { MairoButton, MairoCard } from "@/components/mairo";
import { CreativeThumbs, RisingLine, Sparkline, AudiencePlot } from "@/components/mairo/card-visuals";
import {
  BrandMetaMark,
  BrandTikTokMark,
  BrandInstagramMark,
} from "@/components/mairo/marks";
import { MairoSceneWide, MairoSceneNarrow } from "@/components/mairo/scene";
import {
  HeroStage,
  HeroSlot,
  HeroBeams,
  HeroCoreHud,
  HeroCoreAnchor,
  HeroCommand,
} from "@/components/mairo/hero-stage";

// The MAIRO hero, built from the desktop reference render.
//
// The reference is one symmetrical composition: the statement and the
// intelligence core down the middle, two capability cards on each side, HUD
// labels in the four corners, and a strip of platform marks and figures along
// the bottom. That works at 1440 and collapses badly at 390, so the layout here
// is the same composition expressed twice — a three-column grid on large
// screens, and a single column on a phone where the statement leads, the core
// follows, and the four cards stack under it. Same elements, same order of
// importance, one set of markup.
//
// The render has a "trusted by ambitious brands" logo wall along the bottom.
// It is not reproduced, and nothing stands in its place: those are not MAIRO's
// customers, and the honest version of that strip — the platforms it runs ads
// on — was not worth the height it took. When there are real customer logos,
// this is where they go.

/* ------------------------------------------------------------------ pieces */

const ICON = "h-[18px] w-[18px] text-blue-bright";

/** The small bar glyph beside the two top HUD labels in the reference. */
function BarGlyph({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 26 18" className={`h-4 w-[26px] ${className}`} aria-hidden>
      {[
        [1, 8],
        [6.5, 13],
        [12, 4],
        [17.5, 16],
        [23, 10],
      ].map(([x, h], i) => (
        <rect
          key={i}
          x={x}
          y={18 - h}
          width="2.4"
          height={h}
          rx="1.2"
          fill="#6aa6ff"
          fillOpacity={i % 2 ? 0.55 : 0.95}
        />
      ))}
    </svg>
  );
}

function CornerLabel({
  children,
  align = "left",
  glyph = false,
}: {
  children: ReactNode;
  align?: "left" | "right";
  glyph?: boolean;
}) {
  const right = align === "right";
  return (
    <div className={right ? "text-right" : ""}>
      <div className={`flex items-center gap-2.5 ${right ? "justify-end" : ""}`}>
        {glyph && !right && <BarGlyph />}
        <p className="font-mono text-[9px] uppercase leading-[1.8] tracking-[0.26em] text-faint">
          {children}
        </p>
        {glyph && right && <BarGlyph />}
      </div>
      <span
        aria-hidden
        className={`mt-2 block h-px w-12 ${right ? "ml-auto" : ""}`}
        style={{
          backgroundImage: right
            ? "linear-gradient(to left, rgba(122,162,255,0.6), transparent)"
            : "linear-gradient(to right, rgba(122,162,255,0.6), transparent)",
        }}
      />
    </div>
  );
}

/** The pill chips inside the capability cards. */
function CardChip({ children, icon }: { children: ReactNode; icon?: ReactNode }) {
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-[10px] text-muted"
      style={{ borderColor: "var(--mairo-line)", background: "rgba(255,255,255,0.025)" }}
    >
      {icon}
      {children}
    </span>
  );
}

/** A circular platform tile, as in the Campaign AI card. */
function PlatformTile({ children }: { children: ReactNode }) {
  return (
    <span
      className="flex h-9 w-9 items-center justify-center rounded-full border p-2 text-white/80"
      style={{ borderColor: "var(--mairo-line)", background: "rgba(61,125,255,0.08)" }}
    >
      {children}
    </span>
  );
}

function CapabilityCard({
  icon,
  title,
  badge,
  body,
  children,
}: {
  icon: ReactNode;
  title: string;
  badge: string;
  body: string;
  children?: ReactNode;
}) {
  return (
    // The chevron in the render implies these go somewhere, so they do: all
    // four open the section that explains the whole system. It also makes them
    // reachable by keyboard, which is what lets Tab light the core the same way
    // hovering does — without a link there was nothing in the card to focus and
    // the whole interaction was mouse-only.
    <MairoCard lit href="#capabilities" className="p-4 sm:p-5">
      <div className="flex items-start gap-3.5">
        <span
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border"
          style={{ borderColor: "var(--mairo-line)", background: "rgba(61,125,255,0.10)" }}
        >
          {icon}
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2.5">
            <h3 className="text-[15px] font-medium text-white">{title}</h3>
            <span
              className="rounded-full px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.14em] text-blue-bright"
              style={{ background: "rgba(61,125,255,0.16)" }}
            >
              {badge}
            </span>
          </div>
          <p className="mt-1.5 text-[12.5px] leading-[1.5] text-muted">{body}</p>
        </div>

        {/* The card itself is the link, so this stays aria-hidden — a second
            focus stop for the same destination is just an extra Tab. */}
        <span aria-hidden className="mt-1 shrink-0 text-faint transition-colors group-hover:text-blue-bright">
          <svg viewBox="0 0 12 12" className="h-3.5 w-3.5" fill="none">
            <path d="M4 2l4.5 4L4 10" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
      </div>

      {children}
    </MairoCard>
  );
}

/* ---------------------------------------------------------- the four cards */

function CreativeCard() {
  return (
    <CapabilityCard
      title="Creative AI"
      badge="builds"
      body="Turns your ideas into high-performing ad creatives in seconds."
      icon={
        <svg viewBox="0 0 20 20" fill="none" className={ICON} aria-hidden>
          <rect x="2.5" y="3.5" width="15" height="13" rx="2.5" stroke="currentColor" strokeWidth="1.3" />
          <circle cx="7.5" cy="8" r="1.4" stroke="currentColor" strokeWidth="1.3" />
          <path d="M3.5 14l4-4 3.5 3.5 2.5-2 3 3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      }
    >
      <CreativeThumbs />
      <div className="mt-3 flex flex-wrap gap-1.5">
        {["Images", "Videos", "Hooks", "Variations"].map((c) => (
          <CardChip key={c}>{c}</CardChip>
        ))}
      </div>
    </CapabilityCard>
  );
}

function CampaignCard() {
  return (
    <CapabilityCard
      title="Campaign AI"
      badge="launches"
      body="Builds and manages multi-channel campaigns, end to end."
      icon={
        <svg viewBox="0 0 20 20" fill="none" className={ICON} aria-hidden>
          <path d="M17 3L9 11" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
          <path d="M17 3l-5.2 14-2.6-6.2L3 8.2 17 3z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
        </svg>
      }
    >
      <div className="mt-4 flex items-center gap-2.5">
        <PlatformTile>
          <BrandMetaMark />
        </PlatformTile>
        <PlatformTile>
          <BrandTikTokMark />
        </PlatformTile>
        <PlatformTile>
          <BrandInstagramMark />
        </PlatformTile>
        <span
          className="flex h-9 w-9 items-center justify-center rounded-full border text-[15px] leading-none text-faint"
          style={{ borderColor: "var(--mairo-line)" }}
          aria-hidden
        >
          +
        </span>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <div
          className="flex items-end rounded-lg border p-2.5"
          style={{ borderColor: "var(--mairo-line)", background: "rgba(10,17,38,0.5)" }}
        >
          <Sparkline className="h-8" />
        </div>
        <div
          className="rounded-lg border px-3 py-2.5"
          style={{ borderColor: "var(--mairo-line)", background: "rgba(10,17,38,0.5)" }}
        >
          <p className="text-[11px] leading-tight text-white/85">Campaigns live</p>
          <p className="mt-1 flex items-center gap-1 text-[11px] text-blue-bright">
            <svg viewBox="0 0 12 12" className="h-3 w-3 fill-current" aria-hidden>
              <path d="M7 1L2.5 7H5.5L5 11L9.5 5H6.5L7 1Z" />
            </svg>
            Automatically
          </p>
        </div>
      </div>
    </CapabilityCard>
  );
}

const AUDIENCE_CHIPS: { label: string; icon: ReactNode }[] = [
  {
    label: "High intent",
    icon: (
      <svg viewBox="0 0 12 12" className="h-3 w-3 text-blue-bright" fill="none" aria-hidden>
        <circle cx="6" cy="6" r="4.6" stroke="currentColor" strokeWidth="1.1" />
        <circle cx="6" cy="6" r="1.5" fill="currentColor" />
      </svg>
    ),
  },
  {
    label: "Lookalikes",
    icon: (
      <svg viewBox="0 0 12 12" className="h-3 w-3 text-blue-bright" fill="none" aria-hidden>
        <circle cx="4.4" cy="4.6" r="2.1" stroke="currentColor" strokeWidth="1.1" />
        <circle cx="8.4" cy="7.4" r="2.1" stroke="currentColor" strokeWidth="1.1" />
      </svg>
    ),
  },
  {
    label: "New segments",
    icon: (
      <svg viewBox="0 0 12 12" className="h-3 w-3 text-blue-bright" fill="none" aria-hidden>
        <path d="M6 1.6v8.8M1.6 6h8.8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    label: "Predictive AI",
    icon: (
      <svg viewBox="0 0 12 12" className="h-3 w-3 text-blue-bright" fill="none" aria-hidden>
        <path d="M1.8 8.8L4.4 5.6l2.2 2 3.6-4.4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
];

function AudienceCard() {
  return (
    <CapabilityCard
      title="Audience AI"
      badge="finds"
      body="Discovers, segments, and predicts your highest-value customers."
      icon={
        <svg viewBox="0 0 20 20" fill="none" className={ICON} aria-hidden>
          <circle cx="7.5" cy="7" r="2.6" stroke="currentColor" strokeWidth="1.3" />
          <circle cx="14" cy="8.5" r="2" stroke="currentColor" strokeWidth="1.3" />
          <path d="M3 16c0-2.3 2-4 4.5-4s4.5 1.7 4.5 4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
          <path d="M13.5 12.5c2 .3 3.5 1.7 3.5 3.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
        </svg>
      }
    >
      <div className="mt-4 grid grid-cols-[1.35fr_1fr] gap-2">
        <div
          className="flex items-center rounded-lg border p-2"
          style={{ borderColor: "var(--mairo-line)", background: "rgba(10,17,38,0.5)" }}
        >
          <AudiencePlot />
        </div>
        <div className="flex flex-col justify-between gap-1.5">
          {AUDIENCE_CHIPS.map((c) => (
            <CardChip key={c.label} icon={c.icon}>
              {c.label}
            </CardChip>
          ))}
        </div>
      </div>
    </CapabilityCard>
  );
}

function OptimizationCard() {
  return (
    <CapabilityCard
      title="Optimization AI"
      badge="improves"
      body="Learns in real time and maximizes performance automatically."
      icon={
        <svg viewBox="0 0 20 20" fill="none" className={ICON} aria-hidden>
          <path d="M3 16V9M8 16V5M13 16v-4M18 16V7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      }
    >
      <div className="mt-4 grid grid-cols-[1.5fr_1fr] gap-2">
        <div
          className="flex items-center rounded-lg border px-2.5 py-2"
          style={{ borderColor: "var(--mairo-line)", background: "rgba(10,17,38,0.5)" }}
        >
          <RisingLine className="h-11" />
        </div>
        {/* The render puts "+287% Avg. ROAS uplift" here. That is an invented
            performance figure for a product with no customers yet, and it sat
            a couple of hundred pixels from the line saying MAIRO cannot promise
            a return — which is worse than either alone, and is the exact
            pairing the FTC and the CMA look for.
            
            What replaces it is true, on the same subject, and is the thing that
            actually distinguishes this product: the optimizer says what changed
            in words, rather than handing you a chart to interpret. */}
        <div
          className="flex flex-col justify-center rounded-lg border px-3 py-2.5 text-center"
          style={{ borderColor: "var(--mairo-line-lit)", background: "rgba(61,125,255,0.10)" }}
        >
          <p className="text-[13px] font-semibold leading-tight text-white">Plain English</p>
          <p className="mt-1.5 text-[9.5px] leading-tight text-muted">Not just charts</p>
        </div>
      </div>

      <div className="mt-2.5 grid grid-cols-3 gap-1.5">
        {[
          { label: "Lower CPA", dir: "down" },
          { label: "Higher ROAS", dir: "up" },
          { label: "More Sales", dir: "up" },
        ].map((s) => (
          <span
            key={s.label}
            className="inline-flex items-center justify-center gap-1 rounded-md border px-1.5 py-1 text-[9.5px] text-muted"
            style={{ borderColor: "var(--mairo-line)", background: "rgba(255,255,255,0.025)" }}
          >
            <svg viewBox="0 0 10 10" className="h-2.5 w-2.5 shrink-0 text-blue-bright" fill="none" aria-hidden>
              {s.dir === "up" ? (
                <path d="M5 8.5V1.5M2 4.5L5 1.5l3 3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
              ) : (
                <path d="M5 1.5v7M2 5.5L5 8.5l3-3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
              )}
            </svg>
            {s.label}
          </span>
        ))}
      </div>
    </CapabilityCard>
  );
}

/* ----------------------------------------------------------------- the hero */

export function MairoHero() {
  // overflow-x-clip, not overflow-hidden: the core's atmosphere glow is drawn
  // 28% outside its own box on every side, which on a phone — where the core is
  // nearly the full width — pushed the page 67px wider than the viewport and
  // gave the whole site a sideways scroll. `clip` stops that without creating a
  // scroll container, so the glow still bleeds vertically and nothing inside
  // loses position: sticky.
  return (
    // `isolate` is load-bearing: the environment and the streams sit at
    // negative z, and without a stacking context of their own they drop
    // behind the page background and disappear entirely.
    <section
      className="relative isolate overflow-x-clip px-5 pb-16 pt-24 sm:px-8 sm:pb-20 sm:pt-28 lg:pb-24"
      // One number drives the plate and the space reserved for its core. The
      // floor stops the artwork collapsing on a narrow laptop; the ceiling stops
      // it filling an ultrawide with a sphere three feet across.
      style={{ ["--plate-w" as string]: "min(max(100vw, 1240px), 2000px)" }}
    >
      {/* The render itself, behind everything. See scene.tsx for why this is a
          plate rather than the SVG scene it replaced. */}
      <MairoSceneWide />

      <HeroStage>
      <HeroBeams />
      <div className="relative mx-auto w-full max-w-[1460px]">
        {/* The corner labels. Absolute on lg so they sit in the corners of the
            composition as they do in the reference, and simply absent below
            that — on a phone there are no corners to put them in. */}
        <div className="pointer-events-none relative hidden lg:block">
          <div className="absolute left-0 top-8 z-10">
            <CornerLabel glyph>
              Ideas to impact
              <br />
              in seconds
            </CornerLabel>
          </div>
          <div className="absolute right-0 top-8 z-10">
            <CornerLabel align="right" glyph>
              Higher returns
              <br />
              with AI
            </CornerLabel>
          </div>
        </div>

        <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,2.05fr)_minmax(0,1fr)] lg:gap-7 xl:gap-9">
          {/* ---- Left column: two cards. Second on a phone. ---- */}
          <div className="order-2 space-y-4 lg:order-1 lg:mt-[128px] lg:space-y-5">
            <HeroSlot id="creative">
              <CreativeCard />
            </HeroSlot>
            <HeroSlot id="campaign">
              <CampaignCard />
            </HeroSlot>
          </div>

          {/* ---- Centre: the statement, then the core. ---- */}
          <div className="order-1 lg:order-2">
            <div className="relative z-10 mx-auto max-w-2xl text-center">
              <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-blue-bright/85 sm:text-[11px] sm:tracking-[0.34em]">
                Automate <span className="text-faint">|</span> Amplify{" "}
                <span className="text-faint">|</span> Grow Beyond
              </p>

              <h1 className="mt-6 text-[clamp(34px,6.6vw,58px)] font-semibold leading-[1.06] tracking-[-0.03em] text-white">
                You Run Your Business.
                <br />
                <span
                  className="bg-clip-text text-transparent"
                  style={{ backgroundImage: "var(--mairo-ramp-soft)" }}
                >
                  Let Mairo Run Your Ads.
                </span>
              </h1>

              <p className="mx-auto mt-5 max-w-lg text-[14.5px] leading-relaxed text-muted sm:text-[15px]">
                An AI advertising system that builds creatives, launches campaigns, and helps
                optimize performance across Meta and TikTok.
              </p>

              {/* One CTA, not two. The second used to say "Watch a 2-min demo"
                  and point at #how-it-works — a text section, not a video. A
                  play-button icon promising footage that doesn't exist is the
                  kind of small mismatch that costs more trust than the button
                  was worth; the interactive demo further down the page (see
                  live-demo.tsx) is the honest version of "show, don't tell". */}
              <div className="mt-8 flex justify-center">
                <MairoButton href="/sign-up" className="w-full sm:w-auto">
                  Launch your ads
                  <span aria-hidden>→</span>
                </MairoButton>
              </div>

              {/* The command line. Anything typed here is carried into sign-up
                  as `intent`, so the first screen after registering can open on
                  what the person came to do. */}
              <HeroCommand />
            </div>

            <div className="relative mt-4 sm:mt-6 lg:mt-0">
              <MairoSceneNarrow />

              {/* Where the core sits on the plate, in this column's own
                  coordinates. The beams measure this rather than guessing, so
                  they still land when the grid reflows. */}
              <HeroCoreAnchor className="absolute left-1/2 top-[46%] h-2 w-2 -translate-x-1/2 -translate-y-1/2" />
              <HeroCoreHud />

              {/* On lg the core is already on the plate behind this column, so
                  all that is needed is the room it occupies. Sized off the same
                  --plate-w the plate is, which is what keeps the gap under the
                  buttons and the gap above the pill correct as the plate scales
                  rather than drifting apart at wide widths. */}
              <div
                aria-hidden
                className="hidden lg:block"
                style={{ height: "calc(var(--plate-w) * 0.30)" }}
              />

              {/* The two inner labels, which in the reference sit either side of
                  the core's equator rather than under it. */}
              <div className="pointer-events-none absolute inset-x-0 top-[13%] hidden justify-between lg:flex">
                <CornerLabel>
                  One AI core
                  <br />
                  everything you need
                </CornerLabel>
                <CornerLabel align="right">
                  Real brands
                  <br />
                  real growth
                </CornerLabel>
              </div>
            </div>

            <div className="mt-5 flex justify-center lg:mt-7">
              <span
                className="rounded-full border px-5 py-2.5 text-center font-mono text-[9px] uppercase tracking-[0.2em] text-muted sm:text-[10px] sm:tracking-[0.24em]"
                style={{ borderColor: "var(--mairo-line)", background: "rgba(10,16,32,0.65)" }}
              >
                Ads performance compounded by AI
              </span>
            </div>
          </div>

          {/* ---- Right column: two cards. Third on a phone. ---- */}
          <div className="order-3 space-y-4 lg:mt-[128px] lg:space-y-5">
            <HeroSlot id="audience">
              <AudienceCard />
            </HeroSlot>
            <HeroSlot id="optimize">
              <OptimizationCard />
            </HeroSlot>
          </div>
        </div>

        {/* The bottom corner labels, under the side columns. */}
        <div className="mt-10 hidden items-center justify-between lg:flex">
          <CornerLabel>
            Built for today
            <br />
            ready for what&rsquo;s next
          </CornerLabel>
          <CornerLabel align="right">
            Scalable ads
            <br />
            a brighter tomorrow
          </CornerLabel>
        </div>

      </div>
      </HeroStage>
    </section>
  );
}
