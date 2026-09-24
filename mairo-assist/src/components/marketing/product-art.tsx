/** Simple illustrated product art for the SAMPLE demo store (no real merchant images). */
export function JeansArt({ color, shade, className }: { color: string; shade: string; className?: string }) {
  return (
    <svg viewBox="0 0 120 120" className={className} aria-hidden>
      <defs>
        <linearGradient id={`bg-${color.slice(1)}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#1a1f3d" />
          <stop offset="1" stopColor="#0d1026" />
        </linearGradient>
      </defs>
      <rect width="120" height="120" rx="14" fill={`url(#bg-${color.slice(1)})`} />
      <path d="M38 18h44l6 84H66L60 50l-6 52H32z" fill={color} />
      <path d="M38 18h44v8H38z" fill={shade} />
      <path d="M60 26v22" stroke={shade} strokeWidth="1.5" />
      <path d="M44 30c4 6 10 6 12 2M76 30c-4 6-10 6-12 2" stroke={shade} strokeWidth="1.2" fill="none" />
      <circle cx="60" cy="22" r="1.6" fill="#d9c27a" />
    </svg>
  );
}

export function JacketArt({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 120 120" className={className} aria-hidden>
      <rect width="120" height="120" rx="14" fill="#141833" />
      <path d="M46 20l14 8 14-8 20 12-6 22-8-4v46H40V50l-8 4-6-22z" fill="#3b4a7a" />
      <path d="M60 28v70" stroke="#27335a" strokeWidth="2" />
      <path d="M46 20l14 8 14-8" stroke="#8fa2d8" strokeWidth="1.5" fill="none" />
    </svg>
  );
}
