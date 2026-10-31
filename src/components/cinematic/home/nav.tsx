import Link from "next/link";
import { Wordmark } from "@/components/wordmark";

// The homepage's header: the wordmark, two anchors, sign in, start. Nothing
// else — the rest of the site is one tap away in the footer.

export function HomeNav() {
  return (
    <header className="fixed inset-x-0 top-0 z-40 border-b border-[color:var(--v3-line)] bg-[color:var(--v3-ink)]/90">
      <div className="mx-auto flex h-[72px] w-full max-w-[1320px] items-center gap-6 px-5 sm:px-10 lg:px-16">
        <Wordmark href="/" className="text-[15px]" />
        <nav aria-label="Main" className="ml-auto flex items-center gap-1 sm:gap-2">
          <a href="#how" className="hidden min-h-11 items-center px-3 text-[14px] text-white/65 transition hover:text-white md:inline-flex">How it works</a>
          <a href="#pricing" className="hidden min-h-11 items-center px-3 text-[14px] text-white/65 transition hover:text-white md:inline-flex">Pricing</a>
          <Link href="/sign-in" className="inline-flex min-h-11 items-center px-3 text-[14px] text-white/80 transition hover:text-white">Sign in</Link>
          <Link href="/preview" className="cine-cta inline-flex min-h-10 items-center rounded-full px-4 text-[14px] font-semibold">Start free</Link>
        </nav>
      </div>
    </header>
  );
}
