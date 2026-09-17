// The light running between the cards and the core.
//
// In the reference this is the thing that makes the page one picture rather
// than four panels and a sphere: bright ribbons leave the cards, bend around
// the core and carry on out to the frame, with nodes sitting on them where they
// cross. Remove them and the composition falls apart into unrelated boxes,
// which is what it did before this file existed.
//
// The glow is two strokes, not a filter. A wide stroke at low opacity under a
// narrow one at high opacity gives a clean falloff for the price of one extra
// path, where feGaussianBlur over a 1440x900 region is a full-size offscreen
// buffer recomputed on every resize. On a phone that is the difference between
// a page that scrolls and one that stutters.
//
// Hidden below `lg`. On a phone the cards are stacked under the core, so there
// is nothing for a ribbon to connect — it would just be scribble over the text.

type Stream = { d: string; o: number; w: number; dash?: number };

/** Left side: out of the two cards, around the core, away to the bottom. */
const LEFT: Stream[] = [
  { d: "M-40 300 C 180 300, 300 330, 380 400 S 470 520, 520 560", o: 0.85, w: 1.6 },
  { d: "M-40 430 C 200 430, 320 470, 400 540 S 470 640, 560 690", o: 0.6, w: 1.3 },
  { d: "M60 760 C 220 760, 330 720, 430 660 S 520 600, 560 585", o: 0.5, w: 1.1 },
  { d: "M-40 200 C 140 220, 260 250, 330 320", o: 0.35, w: 1 },
];

/** Right side, mirrored but not identical — a mirror reads as a mistake. */
const RIGHT: Stream[] = [
  { d: "M1480 290 C 1260 290, 1140 325, 1060 395 S 970 515, 920 555", o: 0.85, w: 1.6 },
  { d: "M1480 440 C 1245 440, 1125 478, 1045 548 S 975 645, 885 692", o: 0.6, w: 1.3 },
  { d: "M1380 770 C 1220 770, 1110 728, 1010 666 S 920 604, 880 590", o: 0.5, w: 1.1 },
  { d: "M1480 210 C 1300 230, 1185 258, 1115 328", o: 0.35, w: 1 },
];

/** The long arcs that pass behind the core and tie the two sides together. */
const ARCS: Stream[] = [
  { d: "M300 620 C 480 760, 960 760, 1140 620", o: 0.42, w: 1.2 },
  { d: "M250 430 C 430 250, 1010 250, 1190 430", o: 0.3, w: 1 },
];

/** Nodes, on the ribbons. Each one is a dot plus a soft halo. */
const NODES: [number, number, number][] = [
  [380, 400, 3], [520, 560, 2.4], [330, 320, 2], [430, 660, 2.2],
  [1060, 395, 3], [920, 555, 2.4], [1115, 328, 2], [1010, 666, 2.2],
  [188, 300, 2.2], [1272, 290, 2.2], [720, 742, 2.6],
];

function Ribbon({ d, o, w }: Stream) {
  return (
    <>
      {/* the halo */}
      <path d={d} fill="none" stroke="url(#st-grad)" strokeOpacity={o * 0.16} strokeWidth={w * 9} strokeLinecap="round" />
      {/* the line */}
      <path d={d} fill="none" stroke="url(#st-grad)" strokeOpacity={o} strokeWidth={w * 1.25} strokeLinecap="round" />
    </>
  );
}

export function MairoStreams({ className = "" }: { className?: string }) {
  return (
    <div className={`pointer-events-none absolute inset-0 hidden lg:block ${className}`} aria-hidden>
      <svg
        viewBox="0 0 1440 900"
        preserveAspectRatio="xMidYMid slice"
        className="h-full w-full"
        role="presentation"
      >
        <defs>
          <linearGradient id="st-grad" x1="0" y1="0" x2="1" y2="0.4">
            <stop offset="0%" stopColor="#3d7dff" stopOpacity="0.1" />
            <stop offset="30%" stopColor="#a8cfff" />
            <stop offset="62%" stopColor="#c8b8ff" />
            <stop offset="100%" stopColor="#3d7dff" stopOpacity="0.1" />
          </linearGradient>
        </defs>

        {[...ARCS, ...LEFT, ...RIGHT].map((s, i) => (
          <Ribbon key={i} {...s} />
        ))}

        {NODES.map(([x, y, r], i) => (
          <g key={i} className="mairo-stream-node" style={{ animationDelay: `${(i % 5) * 0.8}s` }}>
            <circle cx={x} cy={y} r={r * 3.4} fill="#6aa6ff" fillOpacity="0.14" />
            <circle cx={x} cy={y} r={r} fill="#dceaff" fillOpacity="0.95" />
          </g>
        ))}
      </svg>

      <style>{`
        .mairo-stream-node { animation: mairo-stream-node 5.5s ease-in-out infinite; }
        @keyframes mairo-stream-node {
          0%, 100% { opacity: 0.45; }
          50%      { opacity: 1; }
        }
        @media (prefers-reduced-motion: reduce) {
          .mairo-stream-node { animation: none; opacity: 0.8; }
        }
      `}</style>
    </div>
  );
}
