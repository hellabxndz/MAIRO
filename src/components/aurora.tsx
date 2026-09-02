// The page's living backdrop: coloured nebulae drifting behind a still
// starfield.
//
// Two decisions here are performance ones, and both were measured.
//
// 1. No JavaScript. An earlier take drew this on a <canvas> in a
//    requestAnimationFrame loop and managed 17fps at 1440x900 — filling ~2.9
//    million pixels every frame on the main thread. Here each nebula is one
//    element with a CSS transform animation, which the browser runs on the
//    compositor: rasterise once, then move. No style recalc, no layout, no
//    repaint per frame.
//
// 2. The whole starfield is ONE element. Every layer stacked over the viewport
//    has to be blended again on each composited frame, so 110 individual star
//    <span>s cost far more than the pixels they cover. Painting them as 110
//    radial-gradient background layers on a single div collapses that to one
//    surface, rasterised once and then left alone. Layer count, not star count,
//    was what the profiler kept pointing at.
//
// The stars themselves do not move. Twinkling was the single most expensive
// thing on the previous version of this page, and varying each star's fixed
// brightness reads as a living sky without animating anything.

function seededRandom(seed: number) {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

// Seeded rather than Math.random() so the server and the browser paint an
// identical sky and React sees no hydration mismatch.
const rand = seededRandom(20260902);

const STAR_HUES = [
  [255, 255, 255],
  [255, 255, 255],
  [255, 255, 255],
  [219, 234, 254],
  [233, 213, 255],
  [207, 250, 254],
];

const STARS = Array.from({ length: 110 }, () => {
  const [r, g, b] = STAR_HUES[Math.floor(rand() * STAR_HUES.length)];
  return {
    x: +(rand() * 100).toFixed(2),
    y: +(rand() * 100).toFixed(2),
    size: +(1 + rand() * 2.6).toFixed(1),
    alpha: +(0.2 + rand() * 0.65).toFixed(2),
    rgb: `${r},${g},${b}`,
  };
});

// One background-image with 110 layers, rather than 110 elements.
const starLayers = {
  backgroundImage: STARS.map(
    (s) =>
      `radial-gradient(circle, rgba(${s.rgb},${s.alpha}) 0%, rgba(${s.rgb},${s.alpha}) 42%, rgba(${s.rgb},0) 68%)`
  ).join(","),
  backgroundPosition: STARS.map((s) => `${s.x}% ${s.y}%`).join(","),
  backgroundSize: STARS.map((s) => `${s.size * 2}px ${s.size * 2}px`).join(","),
  backgroundRepeat: "no-repeat",
};

// Three nebulae, not four. Each one is another translucent surface blended over
// the full viewport every frame; the fourth was adding cost without adding much
// that you could actually see.
const NEBULAE = [
  {
    className: "au-a",
    box: "left:-12%; top:-18%; width:72vw; height:72vw; max-width:920px; max-height:920px;",
    color: "rgba(139,92,246,0.36)",
    mid: "rgba(139,92,246,0.13)",
  },
  {
    className: "au-b",
    box: "right:-16%; top:2%; width:64vw; height:64vw; max-width:820px; max-height:820px;",
    color: "rgba(37,99,235,0.32)",
    mid: "rgba(37,99,235,0.11)",
  },
  {
    className: "au-c",
    box: "left:2%; bottom:-22%; width:68vw; height:68vw; max-width:860px; max-height:860px;",
    color: "rgba(192,38,211,0.28)",
    mid: "rgba(192,38,211,0.10)",
  },
];

export function Aurora() {
  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0 -z-10 overflow-hidden bg-[#050310]"
    >
      {NEBULAE.map((n) => (
        <div
          key={n.className}
          className={n.className}
          style={{
            position: "absolute",
            background: `radial-gradient(circle, ${n.color} 0%, ${n.mid} 38%, rgba(0,0,0,0) 70%)`,
          }}
        />
      ))}

      <div style={{ position: "absolute", inset: 0, ...starLayers }} />

      {/* Keeps text legible over the brightest part of the sky. */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_35%,rgba(5,3,16,0.82)_100%)]" />

      <style>{`
        .au-a, .au-b, .au-c { will-change: transform; }

        /* Long, mutually prime-ish durations so the three never line back up
           into a loop you can notice. */
        .au-a { ${NEBULAE[0].box} animation: au-drift-a 46s ease-in-out infinite; }
        .au-b { ${NEBULAE[1].box} animation: au-drift-b 61s ease-in-out infinite; }
        .au-c { ${NEBULAE[2].box} animation: au-drift-c 53s ease-in-out infinite; }

        @keyframes au-drift-a {
          0%, 100% { transform: translate3d(0, 0, 0) scale(1); }
          50%      { transform: translate3d(6vw, 4vh, 0) scale(1.12); }
        }
        @keyframes au-drift-b {
          0%, 100% { transform: translate3d(0, 0, 0) scale(1.08); }
          50%      { transform: translate3d(-5vw, 6vh, 0) scale(1); }
        }
        @keyframes au-drift-c {
          0%, 100% { transform: translate3d(0, 0, 0) scale(1); }
          50%      { transform: translate3d(7vw, -5vh, 0) scale(1.15); }
        }

        @media (prefers-reduced-motion: reduce) {
          .au-a, .au-b, .au-c { animation: none; }
        }
      `}</style>
    </div>
  );
}
