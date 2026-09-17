// The engineered layer: a hairline lattice over the sky, and one slow scan.
//
// The page had exactly two registers, enormous type and a photograph, and both
// of them say "expensive brand" rather than "machine". This is the third: a
// measured grid, the thing every instrument panel and every schematic has,
// sitting between the galaxy and the words.
//
// Deliberately not particles. The lattice does not move at all — it is two
// repeating gradients and a mask, painted once. The only thing that travels is
// the scan, and it is a soft band a third of the screen wide crossing once
// every twenty-two seconds, which reads as a sweep rather than as debris. After
// the run of small moving artifacts on this page, nothing here is small and
// nothing here is random.

export function TechGrid({
  /** The scan only belongs where the eye already is. */
  scan = false,
  className = "",
}: {
  scan?: boolean;
  className?: string;
}) {
  return (
    <div aria-hidden className={`pointer-events-none absolute inset-0 overflow-hidden ${className}`}>
      {/* The lattice. Masked to a soft ellipse so it never reaches an edge and
          turns into a visible rectangle of graph paper. */}
      <div
        className="absolute inset-0"
        style={{
          backgroundImage:
            "repeating-linear-gradient(to right, rgba(255,255,255,0.028) 0 1px, transparent 1px 84px)," +
            "repeating-linear-gradient(to bottom, rgba(255,255,255,0.028) 0 1px, transparent 1px 84px)",
          WebkitMaskImage:
            "radial-gradient(ellipse 120% 78% at 50% 42%, #000 18%, rgba(0,0,0,0.55) 58%, transparent 92%)",
          maskImage:
            "radial-gradient(ellipse 120% 78% at 50% 42%, #000 18%, rgba(0,0,0,0.55) 58%, transparent 92%)",
        }}
      />

      {scan && (
        <>
          <div className="techgrid-scan absolute inset-y-0 w-[34%]" />
          <style>{`
            .techgrid-scan {
              background: linear-gradient(
                to right,
                transparent 0%,
                rgba(150,190,255,0.035) 38%,
                rgba(190,215,255,0.055) 50%,
                rgba(150,190,255,0.035) 62%,
                transparent 100%
              );
              animation: techgrid-scan 22s linear infinite;
              will-change: transform;
            }

            /* Starts and ends fully off the box, so it enters and leaves
               rather than appearing in the middle of the frame. */
            @keyframes techgrid-scan {
              from { transform: translate3d(-120%, 0, 0); }
              to   { transform: translate3d(400%, 0, 0); }
            }

            @media (prefers-reduced-motion: reduce) {
              .techgrid-scan { animation: none; opacity: 0; }
            }
          `}</style>
        </>
      )}
    </div>
  );
}
