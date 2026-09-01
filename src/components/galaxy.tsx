// A fixed, page-wide deep-space backdrop: a twinkling starfield over static
// nebula clouds. Sits behind every section (fixed, so it never scrolls away).
//
// Star positions come from a seeded PRNG (not Math.random()) so the exact
// same field renders on the server and after client hydration — no mismatch.
//
// Performance notes, because this backdrop is on every page and an earlier
// version dropped the site to ~11fps:
//   - The nebula clouds are NOT animated. A large `filter: blur()` surface has
//     to be re-rasterized on every frame it moves, and at 130px blur across
//     half the viewport that alone ate the frame budget. They're static now;
//     at these blur radii the drift was imperceptible anyway.
//   - Stars animate `opacity` only. Animating an SVG `transform` (scale) isn't
//     compositor-accelerated and forces repaint work per star per frame.
//   - Star count is kept modest for the same reason.

function seededRandom(seed: number) {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

const rand = seededRandom(1337);
const STAR_HUES = ["#ffffff", "#ffffff", "#ffffff", "#bae6fd", "#e9d5ff"];

// The starfield is static. Nothing on this page animates while you're just
// sitting and reading it — a continuously twinkling field was measured as the
// single largest cost on the page, and varied per-star opacity reads as a
// living sky without costing a frame. Motion is reserved for moments the
// visitor actually causes: scrolling, and moving the cursor over the network.
const STARS = Array.from({ length: 70 }, () => ({
  x: rand() * 100,
  y: rand() * 100,
  size: 0.6 + rand() * 1.5,
  opacity: 0.25 + rand() * 0.6,
  color: STAR_HUES[Math.floor(rand() * STAR_HUES.length)],
}));

export function Galaxy() {
  return (
    <div aria-hidden className="fixed inset-0 -z-10 overflow-hidden bg-[#030209]">
      {/* Nebula clouds. These are radial gradients rather than solid circles
          with `filter: blur(120px)`. A gradient paints a soft falloff directly
          and costs essentially nothing; a 120px blur across half the viewport
          is one of the most expensive things a page can ask for, and measured
          as a meaningful chunk of the frame budget here. Visually they're
          near-indistinguishable at this softness. */}
      <div
        className="absolute left-[5%] top-[-15%] h-[55vw] w-[55vw] max-w-[720px] max-h-[720px]"
        style={{
          background:
            "radial-gradient(circle, rgba(109,40,217,0.30) 0%, rgba(109,40,217,0.14) 38%, rgba(109,40,217,0) 70%)",
        }}
      />
      <div
        className="absolute right-[-10%] top-[10%] h-[45vw] w-[45vw] max-w-[600px] max-h-[600px]"
        style={{
          background:
            "radial-gradient(circle, rgba(29,78,216,0.26) 0%, rgba(29,78,216,0.12) 38%, rgba(29,78,216,0) 70%)",
        }}
      />
      <div
        className="absolute left-[15%] bottom-[-15%] h-[50vw] w-[50vw] max-w-[650px] max-h-[650px]"
        style={{
          background:
            "radial-gradient(circle, rgba(162,28,175,0.24) 0%, rgba(162,28,175,0.10) 38%, rgba(162,28,175,0) 70%)",
        }}
      />

      {/* Starfield. These are DOM elements, not SVG <circle>s, specifically so
          the twinkle can animate `opacity` on the compositor. Animating opacity
          on an SVG child instead forces a repaint of the entire viewport-sized
          SVG every frame — measured pinning desktop at ~16fps on its own. */}
      {STARS.map((s, i) => (
        <span
          key={i}
          style={{
            position: "absolute",
            left: `${s.x}%`,
            top: `${s.y}%`,
            width: `${(s.size * 2).toFixed(2)}px`,
            height: `${(s.size * 2).toFixed(2)}px`,
            borderRadius: "9999px",
            backgroundColor: s.color,
            opacity: s.opacity,
          }}
        />
      ))}
    </div>
  );
}
