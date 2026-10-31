import { WebsiteStart } from "./website-start";

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
        <p className="cine-intro v3-label" style={{ "--d": 150 } as React.CSSProperties}>
          AI advertising for Facebook &amp; Instagram
        </p>
        <h1 id="hero-title" className="cine-intro v3-display mt-6 text-[clamp(52px,16vw,72px)] text-white sm:text-[clamp(72px,11vw,200px)]" style={{ "--d": 250 } as React.CSSProperties}>
          Your ads,
          <br />
          handled<span className="v3-signal">.</span>
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
    </section>
  );
}
