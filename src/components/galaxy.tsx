// A fixed, page-wide deep-space backdrop: a dense twinkling starfield plus
// slow-drifting nebula clouds in violet/blue/magenta/cyan. Sits behind every
// section (fixed, so it never scrolls away) — this is the site's "galaxy"
// atmosphere, not just a hero decoration.
//
// Star positions come from a seeded PRNG (not Math.random()) so the exact
// same field renders on the server and after client hydration — no mismatch.

function seededRandom(seed: number) {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

const rand = seededRandom(1337);
const STAR_HUES = ["#ffffff", "#ffffff", "#ffffff", "#bae6fd", "#e9d5ff"];

const STARS = Array.from({ length: 180 }, () => ({
  x: rand() * 100,
  y: rand() * 100,
  size: 0.5 + rand() * 1.6,
  opacity: 0.25 + rand() * 0.65,
  delay: rand() * 8,
  duration: 3 + rand() * 6,
  color: STAR_HUES[Math.floor(rand() * STAR_HUES.length)],
}));

export function Galaxy() {
  return (
    <div aria-hidden className="fixed inset-0 -z-10 overflow-hidden bg-[#030209]">
      {/* Nebula clouds */}
      <div className="absolute left-[5%] top-[-15%] h-[55vw] w-[55vw] max-w-[720px] max-h-[720px] rounded-full bg-violet-700/20 blur-[130px] gx-drift-a" />
      <div className="absolute right-[-10%] top-[10%] h-[45vw] w-[45vw] max-w-[600px] max-h-[600px] rounded-full bg-blue-700/[0.18] blur-[130px] gx-drift-b" />
      <div className="absolute left-[15%] bottom-[-15%] h-[50vw] w-[50vw] max-w-[650px] max-h-[650px] rounded-full bg-fuchsia-700/[0.16] blur-[140px] gx-drift-c" />
      <div className="absolute right-[10%] bottom-[5%] h-[35vw] w-[35vw] max-w-[460px] max-h-[460px] rounded-full bg-cyan-600/[0.14] blur-[120px] gx-drift-d" />

      {/* Starfield */}
      <svg className="absolute inset-0 h-full w-full">
        {STARS.map((s, i) => (
          <circle
            key={i}
            cx={`${s.x}%`}
            cy={`${s.y}%`}
            r={s.size}
            fill={s.color}
            className="gx-star"
            style={{
              opacity: s.opacity,
              animationDelay: `${s.delay}s`,
              animationDuration: `${s.duration}s`,
            }}
          />
        ))}
      </svg>

      <style>{`
        .gx-drift-a { animation: gx-drift-a 40s ease-in-out infinite; }
        .gx-drift-b { animation: gx-drift-b 48s ease-in-out infinite; }
        .gx-drift-c { animation: gx-drift-c 55s ease-in-out infinite; }
        .gx-drift-d { animation: gx-drift-d 36s ease-in-out infinite; }
        @keyframes gx-drift-a {
          0%, 100% { transform: translate(0,0) scale(1); }
          50% { transform: translate(4%, 5%) scale(1.08); }
        }
        @keyframes gx-drift-b {
          0%, 100% { transform: translate(0,0) scale(1); }
          50% { transform: translate(-5%, 4%) scale(1.06); }
        }
        @keyframes gx-drift-c {
          0%, 100% { transform: translate(0,0) scale(1); }
          50% { transform: translate(3%, -4%) scale(1.1); }
        }
        @keyframes gx-drift-d {
          0%, 100% { transform: translate(0,0) scale(1); }
          50% { transform: translate(-4%, -3%) scale(0.95); }
        }
        .gx-star { animation: gx-twinkle ease-in-out infinite; transform-origin: center; transform-box: fill-box; }
        @keyframes gx-twinkle {
          0%, 100% { opacity: var(--o, 0.4); transform: scale(1); }
          50% { opacity: 1; transform: scale(1.4); }
        }
        @media (prefers-reduced-motion: reduce) {
          .gx-drift-a, .gx-drift-b, .gx-drift-c, .gx-drift-d, .gx-star { animation: none; }
        }
      `}</style>
    </div>
  );
}
