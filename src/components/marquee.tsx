// A continuously scrolling strip.
//
// The animation moves `transform` on one element, which the compositor handles
// on its own thread — no layout, no paint, no main-thread work per frame. The
// row is duplicated so the loop is seamless: when the first copy has travelled
// exactly its own width, the second is in the same place it started.
export function Marquee({ items }: { items: string[] }) {
  const row = (
    <div className="flex shrink-0 items-center gap-14 pr-14" aria-hidden>
      {items.map((item, i) => (
        <span key={i} className="flex items-center gap-14 whitespace-nowrap">
          <span className="text-sm uppercase tracking-[0.18em] text-neutral-500">{item}</span>
          <span className="h-1 w-1 rounded-full bg-violet-400/60" />
        </span>
      ))}
    </div>
  );

  return (
    <div className="relative flex overflow-hidden border-y border-white/10 py-5">
      <div className="mq-track flex">
        {row}
        {row}
      </div>
      {/* Fade the strip into the page rather than letting it hit the edges. */}
      <div className="pointer-events-none absolute inset-y-0 left-0 w-24 bg-gradient-to-r from-[#050310] to-transparent" />
      <div className="pointer-events-none absolute inset-y-0 right-0 w-24 bg-gradient-to-l from-[#050310] to-transparent" />
      <style>{`
        .mq-track { animation: mq 38s linear infinite; will-change: transform; }
        @keyframes mq { from { transform: translate3d(0,0,0); } to { transform: translate3d(-50%,0,0); } }
        @media (prefers-reduced-motion: reduce) { .mq-track { animation: none; } }
      `}</style>
    </div>
  );
}
