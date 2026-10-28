// The AIOS core: a calm orb whose colour is the worst line in today's brief —
// teal when steady, amber when something needs a look, red when something is
// failing. It turns slowly only where motion is welcome; the state is also
// written out, so the colour is never the only signal.

const TONE = {
  steady: { cls: "text-signal", label: "Steady" },
  attention: { cls: "text-amber-300", label: "Needs a look" },
  alert: { cls: "text-red-400", label: "Something's failing" },
} as const;

export function AiCore({ state, size = 168 }: { state: keyof typeof TONE; size?: number }) {
  const t = TONE[state];
  return (
    <div className={`relative shrink-0 ${t.cls}`} style={{ width: size, height: size }} role="img" aria-label={`Platform state: ${t.label}`}>
      <div aria-hidden className="mairo-core-glow absolute inset-[18%] rounded-full bg-current opacity-25 blur-2xl" />
      <svg aria-hidden viewBox="0 0 200 200" className="absolute inset-0 h-full w-full">
        <defs>
          <radialGradient id="mairo-core-fill" cx="50%" cy="42%" r="60%">
            <stop offset="0%" stopColor="currentColor" stopOpacity="0.95" />
            <stop offset="55%" stopColor="currentColor" stopOpacity="0.35" />
            <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
          </radialGradient>
        </defs>
        <g className="mairo-core-ring" style={{ transformOrigin: "100px 100px" }}>
          <circle cx="100" cy="100" r="92" fill="none" stroke="currentColor" strokeOpacity="0.22" strokeWidth="1" strokeDasharray="2 7" />
          <path d="M100 8 A92 92 0 0 1 192 100" fill="none" stroke="currentColor" strokeOpacity="0.7" strokeWidth="1.6" strokeLinecap="round" />
        </g>
        <g className="mairo-core-ring-rev" style={{ transformOrigin: "100px 100px" }}>
          <circle cx="100" cy="100" r="74" fill="none" stroke="currentColor" strokeOpacity="0.16" strokeWidth="6" strokeDasharray="1 11" />
          <path d="M26 100 A74 74 0 0 1 100 26" fill="none" stroke="currentColor" strokeOpacity="0.5" strokeWidth="1.2" strokeLinecap="round" />
        </g>
        <circle cx="100" cy="100" r="56" fill="none" stroke="currentColor" strokeOpacity="0.28" strokeWidth="1" />
        <circle className="mairo-core-pulse" cx="100" cy="100" r="40" fill="url(#mairo-core-fill)" style={{ transformOrigin: "100px 100px" }} />
        <circle cx="100" cy="100" r="7" fill="currentColor" />
      </svg>
    </div>
  );
}

export const CORE_LABEL = { steady: TONE.steady.label, attention: TONE.attention.label, alert: TONE.alert.label };
