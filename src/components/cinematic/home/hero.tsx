import Link from "next/link";

// The first screen. The particles arrive out of the dark as the MAIRO
// wordmark, then gather into the core (director.tsx); the words arrive as
// they settle. Everything here is plain markup, so the headline, the two
// actions and the page's meaning are on screen and indexable before a single
// particle is drawn.

export function CinematicHero({ ctaHref }: { ctaHref: string }) {
  return (
    <section
      id="product"
      aria-labelledby="hero-title"
      data-scene="2:2"
      data-scene-y="0.3"
      data-scene-zoom="1.18"
      data-scene-ym="0.42"
      className="relative flex min-h-[100svh] flex-col items-center justify-end px-5 pb-[11svh] pt-28 text-center sm:pb-[9svh]"
    >
      <p className="cine-intro text-[11.5px] font-semibold uppercase tracking-[0.42em] text-[#8fb4ff]" style={{ "--d": 350 } as React.CSSProperties}>
        The AI advertising team
      </p>
      <h1 id="hero-title" className="cine-title cine-glow mt-5 text-[clamp(38px,8.4vw,128px)] text-white">
        <span className="cine-intro block" style={{ "--d": 500 } as React.CSSProperties}>Your business.</span>
        <span className="cine-intro cine-ink block" style={{ "--d": 650 } as React.CSSProperties}>Powered by AI.</span>
      </h1>
      <p className="cine-intro mx-auto mt-6 max-w-[560px] text-[clamp(16px,1.5vw,19px)] leading-relaxed text-white/72" style={{ "--d": 850 } as React.CSSProperties}>
        Your AI advertising team. From strategy to creative to campaigns — all in one place.
      </p>
      <div className="cine-intro mt-9 flex w-full flex-col items-center justify-center gap-3 sm:w-auto sm:flex-row" style={{ "--d": 1000 } as React.CSSProperties}>
        <Link href={ctaHref} className="cine-cta inline-flex min-h-[56px] w-full items-center justify-center gap-2 rounded-full px-8 text-[16px] font-semibold sm:w-auto">
          Build My Free Plan <span aria-hidden>→</span>
        </Link>
        <a href="#how" className="inline-flex min-h-[56px] w-full items-center justify-center rounded-full border border-white/20 bg-white/[0.03] px-7 text-[16px] font-semibold text-white backdrop-blur-sm transition hover:border-white/45 sm:w-auto">
          See How MAIRO Works
        </a>
      </div>
      <span aria-hidden className="cine-intro mt-10 hidden h-10 w-px bg-gradient-to-b from-white/50 to-transparent sm:block" style={{ "--d": 1600 } as React.CSSProperties} />
    </section>
  );
}
