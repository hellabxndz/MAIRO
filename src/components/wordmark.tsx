import Link from "next/link";

// MAIRO's name as it is drawn everywhere on the public site: light weight,
// wide letter-spacing. One component, so the header, the footer, the sign-up
// page and the legal pages can't drift apart.
export function Wordmark({ href = "/", className = "text-[19px]" }: { href?: string | null; className?: string }) {
  const mark = <span className={`font-light tracking-[0.34em] text-white ${className}`}>MAIRO</span>;
  return href ? (
    <Link href={href} aria-label="MAIRO home" className="inline-block">
      {mark}
    </Link>
  ) : (
    mark
  );
}
