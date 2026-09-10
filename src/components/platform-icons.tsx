import type { AdPlatform } from "@/generated/prisma/enums";

// Platform marks, drawn rather than fetched.
//
// Inline SVG for two reasons that both matter here. The obvious one is that a
// campaign card showing two icons should not cost two network requests. The
// less obvious one is that this page sits on a black galaxy: a hosted brand
// asset arrives with whatever background its owner baked in, and half of them
// come with a white box around them. Drawing the paths means every mark is
// transparent, currentColor-aware where it should be, and looks like it
// belongs to the same product.
//
// These are simplified geometric marks, not the brands' official logotypes.
// That is deliberate — a product surface that says "this campaign runs on
// Meta and TikTok" is nominative use, and a simplified mark on a dark UI reads
// better at 16px than a faithful logo does anyway.

export function MetaMark({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
      <path
        d="M3.2 14.6c0-3.9 1.9-7.2 4.4-7.2 1.5 0 2.6 1 4.4 3.7 1.7-2.6 2.9-3.7 4.4-3.7 2.6 0 4.4 3.2 4.4 7.2 0 2.2-.9 3.6-2.6 3.6-1.6 0-2.6-1-4.4-4-.3-.5-.6-1-.9-1.5l-.9 1.5c-1.8 3-2.8 4-4.4 4-1.6 0-2.4-1.4-2.4-3.6Z"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function TikTokMark({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
      <path
        d="M14.2 3v9.9a3.3 3.3 0 1 1-2.6-3.2"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M14.2 3c.3 2.3 2 4 4.3 4.2"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function GenericMark({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
      <circle cx="12" cy="12" r="8" stroke="currentColor" strokeWidth="1.7" />
    </svg>
  );
}

const MARKS: Partial<Record<AdPlatform, (p: { className?: string }) => React.ReactElement>> = {
  META: MetaMark,
  TIKTOK: TikTokMark,
};

export function PlatformIcon({
  platform,
  className = "h-4 w-4",
}: {
  platform: AdPlatform;
  className?: string;
}) {
  const Mark = MARKS[platform] ?? GenericMark;
  return <Mark className={className} />;
}

/**
 * The row of marks on a campaign card.
 *
 * Rendered as a labelled group rather than bare icons — a screen reader
 * reaching a campaign card should hear which networks it runs on, and two
 * decorative SVGs would tell it nothing.
 */
export function PlatformIcons({
  platforms,
  className = "",
}: {
  platforms: AdPlatform[];
  className?: string;
}) {
  if (platforms.length === 0) return null;
  const label = platforms
    .map((p) => (p === "META" ? "Meta" : p === "TIKTOK" ? "TikTok" : p))
    .join(" and ");

  return (
    <span
      className={`inline-flex items-center gap-1.5 text-neutral-400 ${className}`}
      role="img"
      aria-label={`Runs on ${label}`}
    >
      {platforms.map((p) => (
        <PlatformIcon key={p} platform={p} className="h-4 w-4" />
      ))}
    </span>
  );
}
