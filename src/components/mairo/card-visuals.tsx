// The artwork inside the four capability cards.
//
// Everything here is drawn, not photographed. The reference render shows
// product photos inside the Creative AI card — a trainer, a bottle, a
// landscape — and using real ones would mean either licensing stock or lifting
// someone's product shots, for a panel that is 96px tall. Drawn silhouettes in
// the brand palette read as "these are ad creatives" at that size just as well,
// and cost one request instead of three.
//
// The charts are the same idea. They are shapes, chosen to sit well in the
// composition, and they are marked aria-hidden so a screen reader is never told
// a made-up number — the words beside them carry the meaning.

/* ------------------------------------------------------- creative thumbnails */

const TILE =
  "relative aspect-[3/4] overflow-hidden rounded-lg border";
const TILE_STYLE = {
  borderColor: "var(--mairo-line)",
  background: "linear-gradient(160deg, rgba(38,62,126,0.55), rgba(10,17,38,0.9))",
};

function Trainer() {
  return (
    <svg viewBox="0 0 60 80" className="absolute inset-0 h-full w-full" aria-hidden>
      <defs>
        <linearGradient id="cv-shoe" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#cfe2ff" stopOpacity="0.92" />
          <stop offset="100%" stopColor="#5f8dff" stopOpacity="0.5" />
        </linearGradient>
      </defs>
      <ellipse cx="30" cy="62" rx="22" ry="4" fill="#6aa6ff" fillOpacity="0.2" />
      <path
        d="M11 56c-1.5 0-2.5-1-2.5-2.5v-4c0-2 1-3 3-3.6 3-1 5-2.4 7-4.6l4.5-5c1-1.1 2.4-1.5 3.6-.7l2.4 1.6c.9.6 1 1.4.7 2.3l-.6 1.6 5.6 3.2c3.6 2 7.2 3.4 11.2 4 2.4.4 4 1.3 4.6 3 .5 1.4.4 3-.3 4-.6.8-1.6 1.2-3 1.2H11Z"
        fill="url(#cv-shoe)"
      />
      <path d="M13 50.5c2.6-.6 4.6-1.6 6.6-3.2" stroke="#0a1026" strokeOpacity="0.5" strokeWidth="1.1" strokeLinecap="round" />
      <path d="M8.5 53.5h41" stroke="#0a1026" strokeOpacity="0.45" strokeWidth="1.6" />
      <circle cx="35" cy="48" r="1.5" fill="#0a1026" fillOpacity="0.45" />
    </svg>
  );
}

function Bottle() {
  return (
    <svg viewBox="0 0 60 80" className="absolute inset-0 h-full w-full" aria-hidden>
      <defs>
        <linearGradient id="cv-bottle" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#e6f0ff" stopOpacity="0.9" />
          <stop offset="55%" stopColor="#89b4ff" stopOpacity="0.62" />
          <stop offset="100%" stopColor="#3f6ede" stopOpacity="0.45" />
        </linearGradient>
      </defs>
      <ellipse cx="30" cy="66" rx="15" ry="3.2" fill="#6aa6ff" fillOpacity="0.2" />
      <rect x="26" y="14" width="8" height="8" rx="1.4" fill="#cfe2ff" fillOpacity="0.75" />
      <path d="M23 22h14c2.2 0 4 1.8 4 4v34c0 2.6-2 4.6-4.6 4.6H23.6C21 64.6 19 62.6 19 60V26c0-2.2 1.8-4 4-4Z" fill="url(#cv-bottle)" />
      <rect x="23" y="34" width="14" height="13" rx="1.6" fill="#0a1026" fillOpacity="0.32" />
      <path d="M25.5 38.5h9M25.5 42h6" stroke="#cfe2ff" strokeOpacity="0.62" strokeWidth="1.1" strokeLinecap="round" />
    </svg>
  );
}

function Landscape() {
  return (
    <svg viewBox="0 0 60 80" className="absolute inset-0 h-full w-full" aria-hidden>
      <defs>
        <linearGradient id="cv-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#2b4f9e" stopOpacity="0.8" />
          <stop offset="100%" stopColor="#0a1026" stopOpacity="0.3" />
        </linearGradient>
        <linearGradient id="cv-peak" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#dce9ff" stopOpacity="0.95" />
          <stop offset="60%" stopColor="#6f9bf0" stopOpacity="0.55" />
          <stop offset="100%" stopColor="#24407e" stopOpacity="0.5" />
        </linearGradient>
      </defs>
      <rect width="60" height="80" fill="url(#cv-sky)" />
      <circle cx="43" cy="20" r="6" fill="#dbe8ff" fillOpacity="0.5" />
      <path d="M0 62l16-24 11 15 8-10 25 33H0V62Z" fill="url(#cv-peak)" />
      <path d="M16 38l5.5 7.5h-11L16 38Z" fill="#f2f7ff" fillOpacity="0.85" />
      <path d="M0 66h60v14H0z" fill="#0a1026" fillOpacity="0.4" />
    </svg>
  );
}

export function CreativeThumbs() {
  return (
    <div className="mt-4 grid grid-cols-3 gap-2">
      {[<Trainer key="a" />, <Bottle key="b" />, <Landscape key="c" />].map((art, i) => (
        <div key={i} className={TILE} style={TILE_STYLE}>
          {art}
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------- charts */

/**
 * A rising line.
 *
 * The shape is fixed rather than generated, because a random walk drawn four
 * times a second is a different picture every reload and the composition stops
 * being designed. It carries no axis and no numbers on purpose: it is a mark
 * that says "this trends up", not a chart claiming a result.
 */
export function RisingLine({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 120 44" className={`w-full ${className}`} preserveAspectRatio="none" aria-hidden>
      <defs>
        <linearGradient id="cv-line" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#6aa6ff" />
          <stop offset="100%" stopColor="#a78bfa" />
        </linearGradient>
        <linearGradient id="cv-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#6aa6ff" stopOpacity="0.28" />
          <stop offset="100%" stopColor="#6aa6ff" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d="M2 38 L20 32 L34 34 L50 24 L66 26 L82 16 L98 12 L118 4 L118 44 L2 44 Z" fill="url(#cv-fill)" />
      <path
        d="M2 38 L20 32 L34 34 L50 24 L66 26 L82 16 L98 12 L118 4"
        fill="none"
        stroke="url(#cv-line)"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="118" cy="4" r="2.6" fill="#cfe2ff" />
    </svg>
  );
}

/** The smaller sparkline in the Campaign AI card. */
export function Sparkline({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 100 34" className={`w-full ${className}`} preserveAspectRatio="none" aria-hidden>
      <path
        d="M2 28 L14 22 L26 25 L38 16 L50 19 L62 11 L74 14 L86 7 L98 3"
        fill="none"
        stroke="#6aa6ff"
        strokeOpacity="0.9"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="98" cy="3" r="2.2" fill="#cfe2ff" />
    </svg>
  );
}

/* ----------------------------------------------------------------- audience */

/**
 * The audience cluster.
 *
 * A scatter that thickens toward the middle-right, which is what a distribution
 * of customers concentrating around a segment looks like. Fixed coordinates,
 * same reason as the line.
 */
const CLUSTER: [number, number, number][] = [
  [18, 58, 1.5], [26, 62, 1.3], [34, 55, 1.6], [30, 48, 1.2], [42, 60, 1.8],
  [48, 52, 2.2], [52, 44, 1.9], [46, 38, 1.5], [58, 48, 2.4], [62, 40, 2],
  [56, 33, 1.7], [66, 30, 1.5], [70, 44, 2.6], [76, 36, 2], [72, 24, 1.6],
  [82, 42, 2.3], [86, 32, 1.8], [80, 22, 1.4], [90, 46, 1.9], [94, 38, 1.5],
  [64, 56, 2.1], [76, 54, 1.8], [88, 56, 1.5], [38, 44, 1.3], [24, 50, 1.1],
];

export function AudiencePlot({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 110 70" className={`w-full ${className}`} aria-hidden>
      <defs>
        <radialGradient id="cv-cluster" cx="62%" cy="55%" r="55%">
          <stop offset="0%" stopColor="#6aa6ff" stopOpacity="0.28" />
          <stop offset="100%" stopColor="#6aa6ff" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect width="110" height="70" fill="url(#cv-cluster)" />
      {/* Two figures at the left, so the plot reads as people rather than dots. */}
      {[
        [10, 40],
        [10, 56],
      ].map(([x, y], i) => (
        <g key={i} opacity="0.7">
          <circle cx={x} cy={y - 6} r="2.6" fill="#9cc4ff" />
          <path d={`M${x - 3.6} ${y + 4} v-2.6a3.6 3.6 0 0 1 7.2 0V${y + 4}`} fill="#9cc4ff" fillOpacity="0.6" />
        </g>
      ))}
      {CLUSTER.map(([x, y, r], i) => (
        <circle key={i} cx={x} cy={y} r={r} fill={r > 2 ? "#cfe2ff" : "#6aa6ff"} fillOpacity={r > 2 ? 0.92 : 0.55} />
      ))}
    </svg>
  );
}
