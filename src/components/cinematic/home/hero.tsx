import { WebsiteStart } from "./website-start";
import { HeroReadout } from "./live";

// The first screen. The lines arrive out of the dark as the ribbon
// (director.tsx) while the words arrive. Everything here is plain markup, so
// the headline, the website box and the page's meaning are on screen and
// indexable before a single particle is drawn.

export function CinematicHero() {
  return (
    <section
      id="product"
      aria-labelledby="hero-title"
      data-scene="1:1"
      data-scene-x="0.22"
      data-scene-y="0.44"
      data-scene-ym="0.5"
      data-scene-zoom="1.2"
      className="relative flex min-h-[100svh] flex-col justify-end"
    >
      <div className="mx-auto w-full max-w-[1320px] px-5 pb-[10svh] pt-28 sm:px-10 lg:px-16">
        <div className="cine-intro flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-6" style={{ "--d": 100 } as React.CSSProperties}>
          <p className="v3-label">AI advertising for Facebook &amp; Instagram</p>
          <span aria-hidden className="hidden h-3 w-px bg-white/20 sm:block" />
          <HeroReadout />
        </div>
        {/* Each line rises out of its own mask: the headline arrives like a title card. */}
        <h1 id="hero-title" className="v3-display mt-6 text-[clamp(52px,16vw,72px)] text-white sm:text-[clamp(72px,11vw,200px)]">
          <span className="v3-mask">
            <span className="v3-rise" style={{ "--d": 180 } as React.CSSProperties}>Your ads,</span>
          </span>
          <span className="v3-mask">
            <span className="v3-rise" style={{ "--d": 320 } as React.CSSProperties}>
              handled<span className="v3-signal">.</span>
            </span>
          </span>
        </h1>
        <div className="mt-10 grid gap-8 lg:mt-14 lg:grid-cols-[1fr_minmax(0,560px)] lg:items-end lg:gap-16">
          <p className="cine-intro max-w-[460px] text-[clamp(17px,1.4vw,19px)] leading-relaxed text-[color:var(--v3-text-2)]" style={{ "--d": 450 } as React.CSSProperties}>
            MAIRO reads your business, makes your ads, runs them on Meta and tells you what worked. You approve every dollar.
          </p>
          <div className="cine-intro" style={{ "--d": 600 } as React.CSSProperties}>
            <WebsiteStart id="hero-website" />
          </div>
        </div>
      </div>
      {/* A quiet cue that there's more below. */}
      <a href="#how" aria-label="See how MAIRO works" className="cine-intro absolute bottom-6 left-1/2 hidden -translate-x-1/2 flex-col items-center gap-2 text-white/40 transition hover:text-white/80 sm:flex" style={{ "--d": 900 } as React.CSSProperties}>
        <span className="v3-label !text-[10px]">Scroll</span>
        <span aria-hidden className="v3-cue relative block h-10 w-px overflow-hidden bg-white/15" />
      </a>
    </section>
  );
}
