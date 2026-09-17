// The world the hero sits in.
//
// The reference render is not a page on a dark background — it is a place: a
// valley at night, rock either side, a wet floor that reflects, and a lit
// platform under the core with light running down onto it. Without that the
// composition reads as cards floating on black, which is exactly what the page
// looked like before this file existed.
//
// All SVG and CSS, and that is a hard constraint rather than a preference. This
// product spent weeks chasing hard-edged black squares that turned out to come
// from a WebGL scene, and there is no version of a marketing backdrop worth
// reintroducing that risk for. Every glow here is a gradient, every "blur" is a
// wide low-opacity stroke, and there is not a single filter primitive in the
// file — feGaussianBlur over an area this size is the most expensive thing you
// can hand a phone.
//
// Drawn in one viewBox and stretched with `slice`, so the horizon lands in the
// same place at 390 and at 2560 and nothing has to be re-authored per breakpoint.

/** Stars. Fixed, so the sky is composed rather than sprinkled. */
const STARS: [number, number, number, number][] = [
  // x, y, r, opacity
  [120, 60, 1.1, 0.7], [240, 120, 0.8, 0.5], [70, 180, 0.9, 0.45], [330, 48, 1.3, 0.8],
  [420, 150, 0.7, 0.4], [520, 80, 1, 0.6], [610, 190, 0.8, 0.35], [700, 40, 1.2, 0.75],
  [790, 130, 0.9, 0.5], [880, 70, 0.7, 0.4], [960, 170, 1.1, 0.6], [1050, 55, 0.8, 0.45],
  [1140, 140, 1, 0.55], [1230, 90, 0.9, 0.5], [1310, 185, 0.7, 0.35], [1390, 65, 1.2, 0.7],
  [180, 250, 0.7, 0.3], [460, 265, 0.8, 0.35], [1000, 245, 0.7, 0.3], [1280, 270, 0.9, 0.4],
  [60, 95, 0.6, 0.3], [640, 105, 0.6, 0.3], [860, 210, 0.6, 0.28], [1180, 30, 0.9, 0.5],
  [300, 205, 0.6, 0.28], [740, 235, 0.7, 0.32], [1420, 200, 0.8, 0.38], [20, 140, 0.7, 0.33],
];

export function MairoEnvironment({ className = "" }: { className?: string }) {
  return (
    <div className={`pointer-events-none absolute inset-0 overflow-hidden ${className}`} aria-hidden>
      <svg
        viewBox="0 0 1440 900"
        preserveAspectRatio="xMidYMid slice"
        className="h-full w-full"
        role="presentation"
      >
        <defs>
          {/* Sky: black at the top, and blue only near the horizon, which is
              what makes the horizon read as a light source rather than as a
              colour change. */}
          <linearGradient id="env-sky" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#03050c" />
            <stop offset="55%" stopColor="#04060f" />
            <stop offset="80%" stopColor="#071026" />
            <stop offset="100%" stopColor="#050a1c" />
          </linearGradient>

          {/* The glow sitting on the horizon behind the core. */}
          <radialGradient id="env-horizon" cx="50%" cy="100%" r="62%">
            <stop offset="0%" stopColor="#6aa6ff" stopOpacity="0.5" />
            <stop offset="28%" stopColor="#2f66e0" stopOpacity="0.14" />
            <stop offset="68%" stopColor="#12264f" stopOpacity="0" />
          </radialGradient>

          <linearGradient id="env-far" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#0e1830" />
            <stop offset="100%" stopColor="#070d1e" />
          </linearGradient>
          <linearGradient id="env-mid" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#080d1c" />
            <stop offset="100%" stopColor="#04060f" />
          </linearGradient>
          <linearGradient id="env-near" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#04060d" />
            <stop offset="100%" stopColor="#010204" />
          </linearGradient>

          {/* The floor. Brightest right at the horizon and falling away toward
              the reader, which is how a wet surface actually behaves. */}
          <linearGradient id="env-floor" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#0a1430" stopOpacity="0.95" />
            <stop offset="26%" stopColor="#050a1c" stopOpacity="0.92" />
            <stop offset="100%" stopColor="#010204" stopOpacity="1" />
          </linearGradient>

          {/* The reflection of the core, stretched down the floor. */}
          <linearGradient id="env-reflect" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#7fb0ff" stopOpacity="0.42" />
            <stop offset="35%" stopColor="#4d84ff" stopOpacity="0.14" />
            <stop offset="100%" stopColor="#4d84ff" stopOpacity="0" />
          </linearGradient>

          <linearGradient id="env-beam" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#bcd9ff" stopOpacity="0.5" />
            <stop offset="100%" stopColor="#6aa6ff" stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* ---- sky ---- */}
        <rect width="1440" height="900" fill="url(#env-sky)" />
        {STARS.map(([x, y, r, o], i) => (
          <circle key={i} cx={x} cy={y} r={r} fill="#dce9ff" fillOpacity={o} />
        ))}

        {/* ---- the glow behind everything ---- */}
        <rect y="330" width="1440" height="370" fill="url(#env-horizon)" />

        {/* ---- rock, three ranges, back to front ----

            Each range is darker and sharper than the one behind it, which is
            the only depth cue available without fog, and they leave the middle
            open so the core has somewhere to sit. */}
        <path
          d="M0 640 L95 520 L150 560 L235 455 L300 525 L360 480 L430 575 L470 545 L520 600 L560 585 L600 640 Z"
          fill="url(#env-far)"
          opacity="0.9"
        />
        <path
          d="M1440 640 L1350 515 L1295 558 L1210 450 L1145 520 L1085 472 L1015 570 L975 540 L925 598 L885 582 L845 640 Z"
          fill="url(#env-far)"
          opacity="0.9"
        />

        <path
          d="M0 660 L70 575 L120 610 L200 505 L265 585 L330 540 L395 625 L450 590 L505 648 L545 630 L580 665 Z"
          fill="url(#env-mid)"
          opacity="1"
        />
        <path
          d="M1440 660 L1372 570 L1320 606 L1240 500 L1178 582 L1112 536 L1046 622 L992 588 L938 646 L898 628 L862 665 Z"
          fill="url(#env-mid)"
          opacity="1"
        />

        <path d="M0 700 L60 618 L118 655 L190 560 L250 640 L318 592 L380 668 L430 640 L470 700 Z" fill="url(#env-near)" />
        <path d="M1440 700 L1382 615 L1324 652 L1252 556 L1190 638 L1124 590 L1062 666 L1010 638 L968 700 Z" fill="url(#env-near)" />

        {/* Rim light on the near ridges, on the sides facing the core. */}
        <path
          d="M190 560 L250 640 M380 668 L318 592"
          stroke="#7fb0ff"
          strokeOpacity="0.5"
          strokeWidth="1.4"
          fill="none"
          strokeLinecap="round"
        />
        <path
          d="M1252 556 L1190 638 M1062 666 L1124 590"
          stroke="#7fb0ff"
          strokeOpacity="0.5"
          strokeWidth="1.4"
          fill="none"
          strokeLinecap="round"
        />

        {/* ---- the floor ---- */}
        <rect y="662" width="1440" height="238" fill="url(#env-floor)" />
        {/* The horizon itself: a hard bright line is what sells a wet surface. */}
        <rect y="660" width="1440" height="1.6" fill="#9cc4ff" fillOpacity="0.5" />

        {/* The core's reflection, and the beam coming down onto the platform. */}
        <ellipse cx="720" cy="700" rx="230" ry="46" fill="url(#env-reflect)" />
        <path d="M690 600 L750 600 L790 900 L650 900 Z" fill="url(#env-beam)" opacity="0.5" />

        {/* ---- the platform ----

            Concentric ellipses rather than a disc: the render's platform is a
            set of lit rings, and rings also survive being scaled to a phone,
            where a filled disc would just be a blue smear. */}
        <g fill="none">
          {[
            [96, 15, 0.55, 1.6],
            [152, 23, 0.4, 1.3],
            [214, 32, 0.3, 1.1],
            [286, 42, 0.2, 1],
            [368, 54, 0.13, 0.9],
          ].map(([rx, ry, o, w], i) => (
            <ellipse
              key={i}
              cx="720"
              cy="704"
              rx={rx}
              ry={ry}
              stroke="#7fb0ff"
              strokeOpacity={o}
              strokeWidth={w}
            />
          ))}
        </g>
        {/* The hot centre of the platform, where the beam lands. */}
        <ellipse cx="720" cy="704" rx="58" ry="9" fill="#cfe2ff" fillOpacity="0.28" />
        <ellipse cx="720" cy="704" rx="26" ry="4" fill="#ffffff" fillOpacity="0.35" />
      </svg>

      {/* A last wash over the top third, so the headline always has somewhere
          dark to sit no matter how bright the sky gets at a given width. */}
      <div
        className="absolute inset-x-0 top-0 h-[46%]"
        style={{ background: "linear-gradient(to bottom, rgba(3,5,12,0.92), rgba(3,5,12,0))" }}
      />
    </div>
  );
}
