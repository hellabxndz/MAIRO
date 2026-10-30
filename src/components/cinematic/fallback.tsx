// What shows where the particles can't: no WebGL2, or the GPU let go of the
// context. Drawn with SVG and CSS only — the same core, still and lit — so
// the page looks intended rather than broken.

export function CoreFallback({ className = "", size = "min(70vmin, 620px)" }: { className?: string; size?: string }) {
  return (
    <div aria-hidden className={`flex items-center justify-center ${className}`}>
      <svg viewBox="-100 -100 200 200" style={{ width: size, height: size }} className="mairo-core-fallback">
        <defs>
          <radialGradient id="cf-heart">
            <stop offset="0" stopColor="#dbe8ff" stopOpacity="0.95" />
            <stop offset="0.25" stopColor="#3b7bff" stopOpacity="0.55" />
            <stop offset="1" stopColor="#0a1a4a" stopOpacity="0" />
          </radialGradient>
        </defs>
        <circle r="70" fill="url(#cf-heart)" />
        <g fill="none" stroke="#5b92ff" strokeOpacity="0.55" strokeWidth="0.6">
          <circle r="46" strokeDasharray="1 3" />
          <circle r="28" strokeDasharray="1 2.4" strokeOpacity="0.7" />
          <ellipse rx="78" ry="20" transform="rotate(-18)" strokeOpacity="0.4" />
          <ellipse rx="86" ry="24" transform="rotate(32)" strokeOpacity="0.28" />
        </g>
      </svg>
    </div>
  );
}
