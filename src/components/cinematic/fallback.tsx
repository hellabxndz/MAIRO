// What shows where the particles can't: no WebGL2, or the GPU let go of the
// context. The ribbon of lines, still, in SVG — so the page looks intended
// rather than broken (docs/DESIGN-SPEC-v3.md §5).

export function FieldFallback({ className = "", size = "min(92vw, 1100px)" }: { className?: string; size?: string }) {
  const lines = Array.from({ length: 18 }, (_, i) => i);
  return (
    <div aria-hidden className={`flex items-center justify-center ${className}`}>
      <svg viewBox="0 0 600 240" style={{ width: size }} className="mairo-field-fallback" fill="none">
        {lines.map((i) => {
          const off = (i - 8.5) * 5.2;
          return (
            <path
              key={i}
              d={`M0 ${120 + off} C 150 ${40 + off * 1.8}, 260 ${200 - off * 1.6}, 380 ${118 + off * 0.4} S 560 ${70 - off}, 600 ${120 + off * 0.6}`}
              stroke="#ffffff"
              strokeOpacity={0.12 + (i % 4) * 0.05}
              strokeWidth="0.8"
            />
          );
        })}
        <path d="M0 122 C 150 50, 260 190, 380 120 S 560 74, 600 122" stroke="#d4ff3a" strokeOpacity="0.85" strokeWidth="1" strokeDasharray="2 10" />
      </svg>
    </div>
  );
}

/** The MAIRO core's still form, for the app (same ribbon, smaller). */
export function CoreFallback({ className = "", size = "100%" }: { className?: string; size?: string }) {
  return <FieldFallback className={className} size={size} />;
}
