import Link from "next/link";

// A quiet link from a screen to the help article that answers its usual
// question — "how do credits work?" beside the credits, and so on.

export function HelpLinks({ links, className = "" }: { links: { slug: string; label: string }[]; className?: string }) {
  return (
    <p className={`flex flex-wrap items-center gap-x-4 gap-y-1 text-[12.5px] text-faint ${className}`}>
      {links.map((l) => (
        <Link key={l.slug} href={`/dashboard/guide/${l.slug}`} className="inline-flex items-center gap-1.5 hover:text-white">
          <svg aria-hidden viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.5">
            <circle cx="8" cy="8" r="6.25" />
            <path d="M6.3 6.2a1.8 1.8 0 0 1 3.5.6c0 1.2-1.8 1.5-1.8 2.6M8 11.4v.1" strokeLinecap="round" />
          </svg>
          {l.label}
        </Link>
      ))}
    </p>
  );
}
