import Link from "next/link";

// MAIRO's name as it is drawn everywhere on the public site: the mark (the
// white M in its ring), then the name in a light weight with wide letter-
// spacing. One component, so the header, the footer, the sign-up page and the
// legal pages can't drift apart. The mark scales with the text.
export function Wordmark({ href = "/", className = "text-[19px]" }: { href?: string | null; className?: string }) {
  const mark = (
    <span className={`inline-flex items-center gap-[0.55em] font-light tracking-[0.34em] text-white ${className}`}>
      {/* eslint-disable-next-line @next/next/no-img-element -- a small mark sized in em; nothing for next/image to optimise */}
      <img src="/brand/mairo-mark.png" alt="" aria-hidden width={192} height={192} className="h-[1.6em] w-[1.6em] shrink-0" />
      MAIRO
    </span>
  );
  return href ? (
    // 44px tall to tap, whatever size the name is drawn at.
    <Link href={href} aria-label="MAIRO home" className="-my-2 inline-flex min-h-11 items-center">
      {mark}
    </Link>
  ) : (
    mark
  );
}
