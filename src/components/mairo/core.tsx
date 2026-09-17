// The MAIRO Intelligence Core.
//
// The glowing sphere at the centre of the reference render: a wireframe globe
// inside three tilted orbital rings, sitting on a lit platform, with the
// wordmark through the middle of it.
//
// It is SVG and CSS. No WebGL, no canvas, no particle system — this product
// spent weeks chasing hard-edged squares that turned out to come from a WebGL
// scene, and there is no version of a marketing background worth reintroducing
// that risk for. Everything here is a path or a gradient, every animation is a
// transform or an opacity, and the whole thing scales to a 320px phone by
// being drawn in a viewBox rather than in pixels.
//
// What it is meant to communicate, in the order someone reads it: there is one
// intelligence (the core), it is connected to things (the nodes and their
// links), it is working (the orbits and the pulse), and it is the brand (the
// wordmark, dead centre, the only text).

/** Nodes on the globe. Fixed rather than random, so the composition is designed. */
const NODES: { x: number; y: number; r: number; lit?: boolean }[] = [
  { x: 108, y: 96, r: 2.6, lit: true },
  { x: 150, y: 70, r: 1.8 },
  { x: 196, y: 92, r: 2.2, lit: true },
  { x: 86, y: 148, r: 2 },
  { x: 214, y: 150, r: 2.4, lit: true },
  { x: 120, y: 196, r: 1.9 },
  { x: 176, y: 206, r: 2.3 },
  { x: 152, y: 132, r: 1.7 },
  { x: 66, y: 118, r: 1.6 },
  { x: 236, y: 118, r: 1.6 },
];

/** Which nodes are wired to which. A network, not a scatter. */
const LINKS: [number, number][] = [
  [0, 1],
  [1, 2],
  [0, 3],
  [2, 4],
  [3, 5],
  [4, 6],
  [5, 6],
  [0, 7],
  [7, 2],
  [8, 0],
  [9, 4],
];

/**
 * The creative tiles around the core.
 *
 * Fixed positions rather than a ring generated from an angle, because a ring
 * puts them at even spacing and the reference does not: they cluster at the
 * sides and leave the top and bottom of the sphere clear, which is what keeps
 * the wordmark readable through the middle.
 */
const TILES: { x: number; y: number; w: number; r: number; o: number }[] = [
  { x: 10, y: 38, w: 6.5, r: -14, o: 0.5 },
  { x: 14, y: 56, w: 8, r: -9, o: 0.72 },
  { x: 21, y: 70, w: 7, r: 7, o: 0.55 },
  { x: 31, y: 78, w: 8.5, r: 12, o: 0.68 },
  { x: 60, y: 79, w: 8, r: -10, o: 0.62 },
  { x: 71, y: 70, w: 9, r: -6, o: 0.78 },
  { x: 80, y: 54, w: 7.5, r: 9, o: 0.6 },
  { x: 84, y: 36, w: 6.5, r: 14, o: 0.45 },
  { x: 26, y: 26, w: 5.5, r: -18, o: 0.36 },
  { x: 68, y: 24, w: 5.5, r: 16, o: 0.34 },
];

export function MairoCore({ className = "" }: { className?: string }) {
  return (
    <div className={`relative ${className}`} aria-hidden>
      {/* The atmosphere the core sits in. Drawn as one radial gradient rather
          than a blur, because blur on an element this large is the most
          expensive thing you can put on a phone. */}
      <div
        className="pointer-events-none absolute inset-[-28%]"
        style={{
          background:
            "radial-gradient(closest-side, rgba(61,125,255,0.46), rgba(61,125,255,0.14) 46%, transparent 74%)",
        }}
      />

      <svg viewBox="0 0 300 300" className="relative w-full" role="presentation">
        <defs>
          <radialGradient id="mairo-globe" cx="42%" cy="36%" r="72%">
            <stop offset="0%" stopColor="#a9d0ff" stopOpacity="0.72" />
            <stop offset="45%" stopColor="#3f7cff" stopOpacity="0.46" />
            <stop offset="100%" stopColor="#0c1c46" stopOpacity="0.9" />
          </radialGradient>
          <linearGradient id="mairo-ring" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#6aa6ff" stopOpacity="0.05" />
            <stop offset="35%" stopColor="#8fc0ff" stopOpacity="1" />
            <stop offset="65%" stopColor="#b9a5ff" stopOpacity="0.95" />
            <stop offset="100%" stopColor="#6aa6ff" stopOpacity="0.05" />
          </linearGradient>
          <linearGradient id="mairo-wire" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#bcd9ff" stopOpacity="0.8" />
            <stop offset="100%" stopColor="#5b8dff" stopOpacity="0.3" />
          </linearGradient>
          {/* Clips the wireframe to the globe so the meridians do not run off
              the edge of the sphere and read as flat ellipses. */}
          <clipPath id="mairo-sphere">
            <circle cx="150" cy="150" r="88" />
          </clipPath>
        </defs>

        {/* ---- Orbits. Three, tilted differently, turning at three speeds so
                the composition never repeats a frame. ---- */}
        <g className="mairo-orbit mairo-orbit-1" style={{ transformOrigin: "150px 150px" }}>
          <ellipse cx="150" cy="150" rx="132" ry="46" fill="none" stroke="url(#mairo-ring)" strokeWidth="1.5" />
        </g>
        <g className="mairo-orbit mairo-orbit-2" style={{ transformOrigin: "150px 150px" }}>
          <ellipse cx="150" cy="150" rx="46" ry="132" fill="none" stroke="url(#mairo-ring)" strokeWidth="1.5" />
        </g>
        <g className="mairo-orbit mairo-orbit-3" style={{ transformOrigin: "150px 150px" }}>
          <ellipse cx="150" cy="150" rx="124" ry="98" fill="none" stroke="url(#mairo-ring)" strokeWidth="1.2" />
        </g>

        {/* ---- The globe ---- */}
        <circle cx="150" cy="150" r="88" fill="url(#mairo-globe)" />
        <g clipPath="url(#mairo-sphere)" stroke="url(#mairo-wire)" fill="none" strokeWidth="0.9">
          {/* Latitudes */}
          {[-58, -30, 0, 30, 58].map((dy) => (
            <ellipse key={dy} cx="150" cy={150 + dy} rx="88" ry={Math.max(10, 88 - Math.abs(dy) * 1.05)} />
          ))}
          {/* Meridians */}
          {[18, 40, 62, 84].map((rx) => (
            <ellipse key={rx} cx="150" cy="150" rx={rx} ry="88" />
          ))}
        </g>

        {/* ---- The network on the surface ---- */}
        <g clipPath="url(#mairo-sphere)">
          {LINKS.map(([a, b], i) => (
            <line
              key={i}
              x1={NODES[a].x}
              y1={NODES[a].y}
              x2={NODES[b].x}
              y2={NODES[b].y}
              stroke="#8fc0ff"
              strokeOpacity="0.28"
              strokeWidth="0.6"
            />
          ))}
          {NODES.map((n, i) => (
            <circle
              key={i}
              cx={n.x}
              cy={n.y}
              r={n.r}
              fill={n.lit ? "#cfe2ff" : "#7aa6ff"}
              fillOpacity={n.lit ? 0.95 : 0.6}
              className={n.lit ? "mairo-node" : undefined}
              style={n.lit ? { animationDelay: `${i * 0.9}s` } : undefined}
            />
          ))}
        </g>

        {/* ---- The rim, which is what actually makes it read as a sphere ---- */}
        <circle cx="150" cy="150" r="88" fill="none" stroke="#cfe2ff" strokeOpacity="0.7" strokeWidth="1.2" />
        <circle cx="150" cy="150" r="88" fill="none" stroke="#5f9bff" strokeOpacity="0.6" strokeWidth="4" className="mairo-breathe" style={{ transformOrigin: "150px 150px" }} />

        {/* ---- The platform it stands on ---- */}
        <g opacity="0.75">
          <ellipse cx="150" cy="268" rx="104" ry="15" fill="none" stroke="#4b7dff" strokeOpacity="0.4" strokeWidth="1" />
          <ellipse cx="150" cy="276" rx="74" ry="10" fill="none" stroke="#6aa6ff" strokeOpacity="0.3" strokeWidth="0.8" />
          <ellipse cx="150" cy="264" rx="132" ry="19" fill="none" stroke="#3d7dff" strokeOpacity="0.18" strokeWidth="0.8" />
        </g>
      </svg>

      {/* The creative tiles drifting around the core.
          
          In the reference these are ad images caught mid-orbit, which is the
          one part of the picture that says what the core is actually doing —
          it is not a decorative globe, it is a thing with creatives moving
          through it. Drawn as translucent cards rather than photographs: at
          this size the content of the image never reads anyway, and eight more
          image requests in the first viewport is not worth a shape.
          
          Positioned in percentages so they hold their place against the sphere
          at every width, and hidden below `sm` — on a phone the core is small
          enough that they crowd the wordmark. */}
      <div className="pointer-events-none absolute inset-0 hidden sm:block" aria-hidden>
        {TILES.map((t, i) => (
          <span
            key={i}
            className="mairo-tile absolute block rounded-[3px] border"
            style={{
              left: `${t.x}%`,
              top: `${t.y}%`,
              width: `${t.w}%`,
              height: `${t.w * 1.34}%`,
              // The tilt goes in a custom property, not in `transform`: the
              // drift keyframes animate transform, so an inline one would be
              // overwritten and every tile would snap square the moment the
              // animation started.
              ["--tilt" as string]: `${t.r}deg`,
              transform: `rotate(${t.r}deg)`,
              borderColor: "rgba(165,200,255,0.42)",
              background:
                "linear-gradient(150deg, rgba(175,210,255,0.42), rgba(45,80,175,0.24))",
              opacity: t.o,
              animationDelay: `${i * 1.3}s`,
            }}
          />
        ))}
      </div>

      {/* The wordmark, in HTML rather than SVG text so it uses the real font
          and stays selectable and legible at every size. */}
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center pb-[10%]">
        <p
          className="text-[clamp(20px,4.6vw,34px)] font-light tracking-[0.36em] text-white"
          style={{ textShadow: "0 2px 18px rgba(4,8,22,0.8)" }}
        >
          MAIRO
        </p>
        {/* Brighter than it looks like it needs to be, and with a shadow: the
            sphere behind it is lit, so the type is sitting on a mid-blue field
            rather than on the page background, and the value that read fine
            against the old dimmer globe fell under 3:1 against this one. */}
        <p
          className="mt-2 max-w-[54%] text-center font-mono text-[7px] uppercase leading-[2] tracking-[0.3em] text-[#d8e7ff] sm:text-[9px]"
          style={{ textShadow: "0 1px 10px rgba(4,8,22,0.85)" }}
        >
          Intelligence turns
          <br />
          opportunity into growth
        </p>
      </div>

      <style>{`
        .mairo-orbit { animation: mairo-spin linear infinite; }
        .mairo-orbit-1 { animation-duration: 38s; }
        .mairo-orbit-2 { animation-duration: 53s; animation-direction: reverse; }
        .mairo-orbit-3 { animation-duration: 71s; }

        @keyframes mairo-spin {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }

        /* The core breathing. One element, one property — the cheapest possible
           way to say "this is running". */
        .mairo-breathe { animation: mairo-breathe 6.5s ease-in-out infinite; }
        @keyframes mairo-breathe {
          0%, 100% { opacity: 0.22; transform: scale(1); }
          50%      { opacity: 0.6;  transform: scale(1.035); }
        }

        /* The tiles breathing in place. A translate, not an orbit: something
           genuinely circling the sphere has to pass behind it, and faking the
           occlusion costs more than the motion is worth. */
        .mairo-tile { animation: mairo-tile 9s ease-in-out infinite; }
        @keyframes mairo-tile {
          0%, 100% { transform: translateY(0) rotate(var(--tilt, 0deg)); }
          50%      { transform: translateY(-5%) rotate(var(--tilt, 0deg)); }
        }

        .mairo-node { animation: mairo-node 4.2s ease-in-out infinite; }
        @keyframes mairo-node {
          0%, 100% { opacity: 0.45; }
          50%      { opacity: 1; }
        }

        @media (prefers-reduced-motion: reduce) {
          .mairo-orbit, .mairo-breathe, .mairo-node, .mairo-tile { animation: none; }
        }
      `}</style>
    </div>
  );
}
