// Platform marks, for the icon row in the Campaign AI card and the strip along
// the bottom of the hero.
//
// Drawn as paths rather than loaded as images: eight <img> tags in the first
// viewport is eight requests and eight chances to lay out twice, and these are
// small enough that inlining them costs less than the markup to lazy-load them.
//
// Every one is `currentColor`, so the strip can be grey at rest and light up on
// hover without a second copy of each file.

type MarkProps = { className?: string };

const BOX = "h-full w-full";

export function MetaMark({ className = BOX }: MarkProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
      <path
        d="M3.2 14.6c0-3.9 1.9-7.4 4.3-7.4 1.4 0 2.4.8 3.9 3 .5.7 1 1.5 1.5 2.4.6-.9 1.1-1.7 1.6-2.4 1.5-2.2 2.5-3 3.9-3 2.4 0 4.4 3.4 4.4 7.3 0 2.4-1.2 3.9-3.2 3.9-1.5 0-2.6-.7-4.2-3.2l-1.2-2-1.2 2c-1.6 2.5-2.7 3.2-4.2 3.2-2.3 0-3.6-1.5-3.6-3.8Zm12.6-2.3c1.3 2.1 2 2.7 2.8 2.7.8 0 1.2-.6 1.2-1.7 0-2.6-1.1-4.9-2.3-4.9-.7 0-1.3.5-2.3 2-.3.4-.6.9-.9 1.4l1.5 2.5Zm-4.1-2.5c-1-1.5-1.6-2-2.3-2-1.2 0-2.3 2.2-2.3 4.8 0 1.2.4 1.8 1.2 1.8.8 0 1.5-.6 2.8-2.7l1.5-2.5c-.3-.5-.6-1-.9-1.4Z"
        fill="currentColor"
      />
    </svg>
  );
}

export function InstagramMark({ className = BOX }: MarkProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
      <rect x="3" y="3" width="18" height="18" rx="5.2" stroke="currentColor" strokeWidth="1.6" />
      <circle cx="12" cy="12" r="4.1" stroke="currentColor" strokeWidth="1.6" />
      <circle cx="17.2" cy="6.8" r="1.1" fill="currentColor" />
    </svg>
  );
}

export function FacebookMark({ className = BOX }: MarkProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
      <path
        d="M13.5 21v-8h2.7l.4-3.1h-3.1V7.9c0-.9.25-1.5 1.55-1.5H16.7V3.6c-.29-.04-1.28-.13-2.43-.13-2.4 0-4.05 1.47-4.05 4.16V9.9H7.5V13h2.72v8h3.28Z"
        fill="currentColor"
      />
    </svg>
  );
}

export function TikTokMark({ className = BOX }: MarkProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
      <path
        d="M16.2 3h-2.7v11.4a2.35 2.35 0 1 1-1.9-2.3V9.3a5.2 5.2 0 1 0 4.6 5.15V9.1a6.2 6.2 0 0 0 3.6 1.15V7.5a3.55 3.55 0 0 1-3.6-3.4V3Z"
        fill="currentColor"
      />
    </svg>
  );
}

export function GoogleMark({ className = BOX }: MarkProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
      <path
        d="M21.3 12.2c0-.66-.06-1.3-.17-1.9H12v3.6h5.2a4.5 4.5 0 0 1-1.93 2.95v2.45h3.12c1.83-1.69 2.9-4.17 2.9-7.1Z"
        fill="currentColor"
        opacity="0.95"
      />
      <path
        d="M12 21.5c2.6 0 4.79-.86 6.39-2.34l-3.12-2.42c-.86.58-1.97.92-3.27.92-2.51 0-4.64-1.7-5.4-3.98H3.37v2.5A9.5 9.5 0 0 0 12 21.5Z"
        fill="currentColor"
        opacity="0.75"
      />
      <path
        d="M6.6 13.68a5.7 5.7 0 0 1 0-3.64v-2.5H3.37a9.5 9.5 0 0 0 0 8.64l3.23-2.5Z"
        fill="currentColor"
        opacity="0.55"
      />
      <path
        d="M12 6.06c1.42 0 2.69.49 3.69 1.44l2.76-2.76C16.78 3.2 14.6 2.3 12 2.3a9.5 9.5 0 0 0-8.63 5.24l3.23 2.5C7.36 7.76 9.49 6.06 12 6.06Z"
        fill="currentColor"
      />
    </svg>
  );
}

export function SnapchatMark({ className = BOX }: MarkProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
      <path
        d="M12 2.8c2.6 0 4.3 1.9 4.3 4.6 0 .8-.06 1.55-.1 2.1.3.16.72.24 1.1.12.5-.16 1 .1 1.13.5.12.42-.14.85-.62 1.04-.28.11-.72.24-1.06.4-.32.14-.5.3-.44.6.2 1.06 1.4 2.86 3.06 3.44.4.14.5.5.36.8-.24.5-1.2.84-2.3 1-.13.3-.2.72-.3 1.02-.08.26-.26.4-.6.34-.5-.08-1.1-.2-1.86-.08-.7.12-1.32.5-1.9.9-.6.42-1.16.72-1.87.72s-1.27-.3-1.87-.72c-.58-.4-1.2-.78-1.9-.9-.76-.12-1.36 0-1.86.08-.34.06-.52-.08-.6-.34-.1-.3-.17-.72-.3-1.02-1.1-.16-2.06-.5-2.3-1-.14-.3-.04-.66.36-.8 1.66-.58 2.86-2.38 3.06-3.44.06-.3-.12-.46-.44-.6-.34-.16-.78-.29-1.06-.4-.48-.19-.74-.62-.62-1.04.13-.4.63-.66 1.13-.5.38.12.8.04 1.1-.12-.04-.55-.1-1.3-.1-2.1C7.7 4.7 9.4 2.8 12 2.8Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function PinterestMark({ className = BOX }: MarkProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
      <circle cx="12" cy="12" r="9.2" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="M10.4 17.6c.36-1.5.9-3.7 1.06-4.4-.2-.4-.34-.98-.34-1.6 0-1.5.86-2.6 1.94-2.6.92 0 1.36.68 1.36 1.5 0 .92-.58 2.3-.88 3.58-.25 1.07.54 1.95 1.6 1.95 1.92 0 3.2-2.46 3.2-5.37 0-2.21-1.5-3.87-4.2-3.87-3.06 0-4.97 2.28-4.97 4.83 0 .88.26 1.5.66 1.98.19.22.21.31.14.56-.05.18-.15.6-.2.77-.07.25-.27.34-.5.25-1.38-.57-2.02-2.09-2.02-3.8 0-2.82 2.38-6.2 7.1-6.2 3.79 0 6.28 2.74 6.28 5.68 0 3.9-2.17 6.81-5.36 6.81-1.07 0-2.08-.58-2.42-1.24l-.66 2.6c-.2.74-.6 1.49-.95 2.05"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function LinkedInMark({ className = BOX }: MarkProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
      <rect x="3" y="3" width="18" height="18" rx="3.4" stroke="currentColor" strokeWidth="1.5" />
      <path d="M7.5 10.2V17" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      <circle cx="7.5" cy="7.3" r="1.15" fill="currentColor" />
      <path
        d="M11.4 17v-6.8m0 2.2c.36-1.1 1.2-1.75 2.4-1.75 1.5 0 2.5 1 2.5 2.85V17"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/* ------------------------------------------------------------ brand colour */

// The three live platforms, in their own colours.
//
// Only used in the Campaign AI card, where the render shows them full colour
// inside circular tiles. Everywhere else the marks stay monochrome and inherit
// — a row of eight brand palettes in the footer would pull harder than the
// headline does.

export function BrandMetaMark({ className = BOX }: MarkProps) {
  return (
    <span className={`block text-[#0081FB] ${className}`}>
      <MetaMark />
    </span>
  );
}

export function BrandTikTokMark({ className = BOX }: MarkProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
      {/* The offset cyan and red plates behind the white glyph are the whole
          identity — drawn as two shifted copies rather than as three paths. */}
      <g transform="translate(-0.9,0.7)">
        <path
          d="M16.2 3h-2.7v11.4a2.35 2.35 0 1 1-1.9-2.3V9.3a5.2 5.2 0 1 0 4.6 5.15V9.1a6.2 6.2 0 0 0 3.6 1.15V7.5a3.55 3.55 0 0 1-3.6-3.4V3Z"
          fill="#25F4EE"
        />
      </g>
      <g transform="translate(0.9,-0.4)">
        <path
          d="M16.2 3h-2.7v11.4a2.35 2.35 0 1 1-1.9-2.3V9.3a5.2 5.2 0 1 0 4.6 5.15V9.1a6.2 6.2 0 0 0 3.6 1.15V7.5a3.55 3.55 0 0 1-3.6-3.4V3Z"
          fill="#FE2C55"
        />
      </g>
      <path
        d="M16.2 3h-2.7v11.4a2.35 2.35 0 1 1-1.9-2.3V9.3a5.2 5.2 0 1 0 4.6 5.15V9.1a6.2 6.2 0 0 0 3.6 1.15V7.5a3.55 3.55 0 0 1-3.6-3.4V3Z"
        fill="#ffffff"
      />
    </svg>
  );
}

export function BrandInstagramMark({ className = BOX }: MarkProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
      <defs>
        <linearGradient id="ig-brand" x1="0" y1="1" x2="1" y2="0">
          <stop offset="0%" stopColor="#FFD521" />
          <stop offset="28%" stopColor="#F50000" />
          <stop offset="62%" stopColor="#B900B4" />
          <stop offset="100%" stopColor="#5100FF" />
        </linearGradient>
      </defs>
      <rect x="3" y="3" width="18" height="18" rx="5.2" stroke="url(#ig-brand)" strokeWidth="1.8" />
      <circle cx="12" cy="12" r="4.1" stroke="url(#ig-brand)" strokeWidth="1.8" />
      <circle cx="17.2" cy="6.8" r="1.2" fill="url(#ig-brand)" />
    </svg>
  );
}
