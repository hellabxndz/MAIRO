// The MAIRO Intelligence Core.
//
// The bright sphere at the centre of the reference render. It is not a
// wireframe globe with a few dots on it — it is dense: several hundred points
// spread evenly over a sphere, wired into a mesh, lit from the front-left and
// wrapped in a hot ring, with ad creatives caught in orbit around it.
//
// SVG and CSS. No WebGL, no canvas, no particle engine — this product spent
// weeks chasing hard-edged black squares that turned out to come from a WebGL
// scene, and there is no version of a marketing graphic worth reintroducing
// that risk for. Everything below is a path, a circle or a gradient, and every
// animation is a transform or an opacity.
//
// What it says, in the order it is read: there is one intelligence (the
// sphere), it is connected (the mesh), it is working (the orbits and the
// pulse), and it is the brand (the wordmark, dead centre, the only text).

const CX = 150;
const CY = 150;
const R = 92;

type Pt = { x: number; y: number; z: number };

/**
 * Points spread evenly over a sphere, then projected flat.
 *
 * A Fibonacci lattice rather than random placement or a lat/long grid. Random
 * clumps, and a grid bunches hard at the poles — both of which read as a
 * mistake at this density. The lattice is the only cheap way to get points that
 * look deliberately even from every angle.
 *
 * Computed once at module load, so the server and the client draw byte-identical
 * markup and React never has to reconcile a hydration mismatch.
 */
function sphere(n: number): Pt[] {
  const golden = Math.PI * (3 - Math.sqrt(5));
  const out: Pt[] = [];
  for (let i = 0; i < n; i++) {
    const y = 1 - (i / (n - 1)) * 2;
    const ring = Math.sqrt(Math.max(0, 1 - y * y));
    const theta = golden * i;
    out.push({
      x: CX + Math.cos(theta) * ring * R,
      y: CY + y * R,
      // z is the depth, -1 at the back and 1 at the front. Everything that
      // makes this read as a ball rather than a disc is driven off it.
      z: Math.sin(theta) * ring,
    });
  }
  return out;
}

const POINTS = sphere(300);

/**
 * The mesh.
 *
 * Joining each point to the one after it traces the lattice's spiral; joining
 * it to the one 17 along cuts across that spiral and turns the spiral into a
 * net. Two passes is enough — a third made it solid rather than woven, and cost
 * three hundred more nodes for the privilege.
 */
const EDGES: [number, number][] = [];
for (let i = 0; i < POINTS.length - 1; i++) {
  EDGES.push([i, i + 1]);
  if (i + 17 < POINTS.length) EDGES.push([i, i + 17]);
}

/**
 * The creative tiles in orbit.
 *
 * Fixed positions rather than a generated ring: an even ring puts one at the
 * top and bottom of the sphere, which is exactly where the wordmark is. These
 * cluster at the sides and leave the middle clear.
 */
const TILES: { x: number; y: number; w: number; r: number; o: number }[] = [
  { x: 9, y: 40, w: 6.5, r: -14, o: 0.5 },
  { x: 13, y: 57, w: 8, r: -9, o: 0.72 },
  { x: 20, y: 71, w: 7, r: 7, o: 0.55 },
  { x: 30, y: 79, w: 8.5, r: 12, o: 0.68 },
  { x: 61, y: 80, w: 8, r: -10, o: 0.62 },
  { x: 72, y: 71, w: 9, r: -6, o: 0.78 },
  { x: 81, y: 55, w: 7.5, r: 9, o: 0.6 },
  { x: 85, y: 37, w: 6.5, r: 14, o: 0.45 },
  { x: 25, y: 26, w: 5.5, r: -18, o: 0.36 },
  { x: 69, y: 24, w: 5.5, r: 16, o: 0.34 },
];

export function MairoCore({ className = "" }: { className?: string }) {
  return (
    <div className={`relative ${className}`} aria-hidden>
      {/* The atmosphere. One radial gradient rather than a blurred shape,
          because blur on an element this large is the most expensive thing you
          can put on a phone. */}
      <div
        className="pointer-events-none absolute inset-[-30%]"
        style={{
          background:
            "radial-gradient(closest-side, rgba(70,135,255,0.5), rgba(61,125,255,0.16) 44%, transparent 72%)",
        }}
      />

      <svg viewBox="0 0 300 300" className="relative w-full" role="presentation">
        <defs>
          {/* Lit from the front-left, so the sphere has a light source rather
              than just being brighter in the middle. */}
          <radialGradient id="core-body" cx="36%" cy="31%" r="78%">
            <stop offset="0%" stopColor="#8fc4ff" stopOpacity="0.34" />
            <stop offset="34%" stopColor="#2c5fd8" stopOpacity="0.34" />
            <stop offset="70%" stopColor="#102a70" stopOpacity="0.62" />
            <stop offset="100%" stopColor="#030817" stopOpacity="0.96" />
          </radialGradient>

          {/* The hole the wordmark sits in. The mesh is dense enough at the
              centre that white type on it lands around 2:1 — this drops the
              value directly behind the text without dimming the sphere. */}
          <radialGradient id="core-well" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#030714" stopOpacity="0.82" />
            <stop offset="62%" stopColor="#040a1c" stopOpacity="0.44" />
            <stop offset="100%" stopColor="#040a1c" stopOpacity="0" />
          </radialGradient>

          <radialGradient id="core-hot" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#eaf3ff" stopOpacity="0.62" />
            <stop offset="34%" stopColor="#6aa6ff" stopOpacity="0.42" />
            <stop offset="66%" stopColor="#4d84ff" stopOpacity="0.14" />
            <stop offset="100%" stopColor="#3d7dff" stopOpacity="0" />
          </radialGradient>

          <linearGradient id="core-ring" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#6aa6ff" stopOpacity="0.04" />
            <stop offset="30%" stopColor="#bcd9ff" stopOpacity="1" />
            <stop offset="62%" stopColor="#b9a5ff" stopOpacity="0.95" />
            <stop offset="100%" stopColor="#6aa6ff" stopOpacity="0.04" />
          </linearGradient>

          <clipPath id="core-clip">
            <circle cx={CX} cy={CY} r={R} />
          </clipPath>
        </defs>

        {/* ---- the halo, behind everything ---- */}
        <circle cx={CX} cy={CY} r={R * 1.62} fill="url(#core-hot)" />

        {/* ---- orbits, three tilts and three speeds so no frame repeats ---- */}
        {/* Each orbit is drawn twice — a wide soft pass under a narrow bright
            one. That is what gives the render's rings their bloom, and it costs
            one extra ellipse where an SVG filter would cost an offscreen buffer
            the size of the sphere, recomputed every frame they rotate. */}
        {[
          { rx: 138, ry: 48, w: 1.7, cls: "mairo-orbit-1" },
          { rx: 48, ry: 138, w: 1.7, cls: "mairo-orbit-2" },
          { rx: 130, ry: 102, w: 1.3, cls: "mairo-orbit-3" },
        ].map((o) => (
          <g
            key={o.cls}
            className={`mairo-orbit ${o.cls}`}
            style={{ transformOrigin: `${CX}px ${CY}px` }}
          >
            <ellipse
              cx={CX}
              cy={CY}
              rx={o.rx}
              ry={o.ry}
              fill="none"
              stroke="url(#core-ring)"
              strokeOpacity="0.3"
              strokeWidth={o.w * 7}
            />
            <ellipse cx={CX} cy={CY} rx={o.rx} ry={o.ry} fill="none" stroke="url(#core-ring)" strokeWidth={o.w} />
          </g>
        ))}

        {/* ---- the body ---- */}
        <circle cx={CX} cy={CY} r={R} fill="url(#core-body)" />

        {/* ---- the mesh ----

            Depth drives opacity on every edge and every node, which is the
            whole trick: the back of the sphere fades out, the front stays
            bright, and a flat circle of dots turns into a ball. */}
        <g clipPath="url(#core-clip)">
          <g stroke="#9cc4ff">
            {EDGES.map(([a, b], i) => {
              const depth = (POINTS[a].z + POINTS[b].z) / 2;
              const front = (depth + 1) / 2;
              return (
                <line
                  key={i}
                  x1={POINTS[a].x}
                  y1={POINTS[a].y}
                  x2={POINTS[b].x}
                  y2={POINTS[b].y}
                  strokeOpacity={0.04 + front * 0.34}
                  strokeWidth={0.25 + front * 0.4}
                />
              );
            })}
          </g>

          {POINTS.map((p, i) => {
            const front = (p.z + 1) / 2;
            return (
              <circle
                key={i}
                cx={p.x}
                cy={p.y}
                r={0.5 + front * 1.1}
                fill={front > 0.78 ? "#f0f6ff" : "#a9cdff"}
                fillOpacity={0.14 + front * 0.86}
                className={i % 23 === 0 ? "mairo-node" : undefined}
                style={i % 23 === 0 ? { animationDelay: `${(i % 7) * 0.7}s` } : undefined}
              />
            );
          })}
        </g>

        {/* The well behind the wordmark. After the mesh, before the rim. */}
        <ellipse cx={CX} cy={CY - 4} rx="76" ry="46" fill="url(#core-well)" />

        {/* ---- the rim, which is what actually reads as "sphere" ---- */}
        <circle cx={CX} cy={CY} r={R} fill="none" stroke="#eaf4ff" strokeOpacity="0.85" strokeWidth="1.4" />
        <circle
          cx={CX}
          cy={CY}
          r={R}
          fill="none"
          stroke="#8fc0ff"
          strokeOpacity="0.6"
          strokeWidth="7"
          className="mairo-breathe"
          style={{ transformOrigin: `${CX}px ${CY}px` }}
        />

        {/* ---- the platform it stands on ---- */}
        <g fill="none">
          <ellipse cx={CX} cy="272" rx="108" ry="15" stroke="#7fb0ff" strokeOpacity="0.4" strokeWidth="1.1" />
          <ellipse cx={CX} cy="280" rx="76" ry="10" stroke="#9cc4ff" strokeOpacity="0.3" strokeWidth="0.9" />
          <ellipse cx={CX} cy="268" rx="138" ry="20" stroke="#5f9bff" strokeOpacity="0.18" strokeWidth="0.9" />
        </g>
        {/* The light coming off the bottom of the sphere onto it. */}
        <path d="M132 244 L168 244 L184 288 L116 288 Z" fill="#bcd9ff" fillOpacity="0.1" />
      </svg>

      {/* The creative tiles. Percentages, so they keep their place against the
          sphere at every width, and hidden below `sm` where the core is small
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
              borderColor: "rgba(175,210,255,0.5)",
              background: "linear-gradient(150deg, rgba(185,218,255,0.5), rgba(45,80,175,0.26))",
              boxShadow: "0 0 14px rgba(110,165,255,0.35)",
              opacity: t.o,
              animationDelay: `${i * 1.3}s`,
            }}
          />
        ))}
      </div>

      {/* The wordmark, in HTML rather than SVG text so it uses the real font and
          stays selectable and legible at every size. The shadow is not
          decoration: the type sits on a lit sphere, not on the page
          background, and without it the subtitle falls under 3:1. */}
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center pb-[10%]">
        <p
          className="text-[clamp(20px,4.6vw,34px)] font-light tracking-[0.36em] text-white"
          style={{ textShadow: "0 2px 20px rgba(3,7,20,0.9)" }}
        >
          MAIRO
        </p>
        <p
          className="mt-2 max-w-[54%] text-center font-mono text-[7px] uppercase leading-[2] tracking-[0.3em] text-[#dceaff] sm:text-[9px]"
          style={{ textShadow: "0 1px 12px rgba(3,7,20,0.95)" }}
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
          0%, 100% { opacity: 0.25; transform: scale(1); }
          50%      { opacity: 0.65; transform: scale(1.03); }
        }

        .mairo-node { animation: mairo-node 4.2s ease-in-out infinite; }
        @keyframes mairo-node {
          0%, 100% { opacity: 0.4; }
          50%      { opacity: 1; }
        }

        /* The tiles breathing in place. A translate, not an orbit: something
           genuinely circling the sphere has to pass behind it, and faking the
           occlusion costs more than the motion is worth. */
        .mairo-tile { animation: mairo-tile 9s ease-in-out infinite; }
        @keyframes mairo-tile {
          0%, 100% { transform: translateY(0) rotate(var(--tilt, 0deg)); }
          50%      { transform: translateY(-5%) rotate(var(--tilt, 0deg)); }
        }

        @media (prefers-reduced-motion: reduce) {
          .mairo-orbit, .mairo-breathe, .mairo-node, .mairo-tile { animation: none; }
        }
      `}</style>
    </div>
  );
}
