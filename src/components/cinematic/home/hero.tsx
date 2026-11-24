import { WebsiteStart } from "./website-start";
import { HeroAd } from "./hero-ad";

// The first screen answers three things in seconds: what MAIRO does (the
// headline), what the owner has to do (type their website), and what they'll
// see if they try (a real-sized ad, and the three moments of working with
// MAIRO on it — components/cinematic/home/hero-ad.tsx). The Field ribbon
// (director.tsx) still moves behind it; everything here is plain markup, so
// the message and the website box are on screen before a particle is drawn.
//
// Claims are the verified ones: MAIRO makes the ads, runs only campaigns the
// owner approves, in the owner's own Meta ad account, and turns the results
// into the next test it proposes.

export function CinematicHero() {
  return (
    <section
      id="product"
      aria-labelledby="hero-title"
      data-scene="1:1"
      data-scene-x="0.22"
      data-scene-y="0.3"
      data-scene-ym="0.2"
      data-scene-zoom="1.2"
      className="relative"
    >
      <div className="mx-auto grid w-full max-w-[1320px] gap-10 px-5 pb-16 pt-[104px] sm:px-10 sm:pt-[132px] lg:pt-[112px] lg:grid-cols-[minmax(0,1fr)_340px] lg:items-center lg:gap-16 lg:px-16 lg:pb-24">
        <div className="min-w-0">
          <p className="v3-label">AI advertising for Facebook &amp; Instagram</p>
          {/* Painted at once — no entry animation. The headline is the page's
              largest element, so anything that hides it first (a mask, a fade)
              delays Largest Contentful Paint for every visitor. */}
          <h1 id="hero-title" className="v3-display mt-5 text-[clamp(40px,10.5vw,58px)] text-white [text-wrap:balance] sm:text-[clamp(56px,6.4vw,92px)]">
            Your AI advertising department.{" "}
            <span className="text-[color:var(--v3-text-2)]">Without the agency fees.</span>
          </h1>
          <p className="mt-6 max-w-[560px] text-[clamp(16.5px,1.4vw,19px)] leading-relaxed text-[color:var(--v3-text-2)]">
            Connect your Meta ad account, tell MAIRO your goal and budget, and approve the strategy. MAIRO makes the ads, runs the campaigns you approve, and learns from every result.
          </p>
          <div className="cine-intro mt-8 max-w-[600px]" style={{ "--d": 440 } as React.CSSProperties}>
            <WebsiteStart id="hero-website" />
          </div>
        </div>
        <div className="cine-intro min-w-0" style={{ "--d": 520 } as React.CSSProperties}>
          <HeroAd />
        </div>
      </div>
    </section>
  );
}
